# ADR 0005: Propuestas, usuarios, perfil y papelera

## Estado

Aceptada (Bloque 3). Modifica el ADR 0003 en un punto: el access token ya no basta por sí solo. Completa los pendientes
del ADR 0004 sobre crear, editar y enviar propuestas y sobre restaurar desde la Papelera.

## Contexto

El Bloque 3 agrega lo necesario para operar sin el seed: redactar propuestas, invitar y administrar usuarios, editar el
perfil y recuperar lo eliminado. Varias reglas nuevas dependen de que un cambio de acceso aplique de inmediato:
desactivar a alguien, cambiarle el rol o cerrar sus otras sesiones al cambiar la contraseña.

## Decisión

### El acceso se valida contra la sesión en cada petición

Hasta el Bloque 2 el middleware de auth solo verificaba la firma del JWT. Una cuenta desactivada o con la sesión revocada
seguía operando hasta 15 minutos, y el rol viajaba en el token.

Ahora `authMiddleware` (y el canal de tiempo real al conectar) llaman a `resolveAccess` (`modules/identity/access.ts`):

- La sesión del claim `sid` debe existir, no estar revocada ni vencida y pertenecer al usuario del token.
- La cuenta debe estar `active`.
- `request.user.role` sale de la base, no del token.

Ambas lecturas van acotadas al `tenantId` del token: no es una excepción nueva a la regla de tenant del ADR 0003. Si
algo falla, la respuesta es 401 `INVALID_TOKEN` y el cliente intenta renovar, lo que también falla si la sesión se cerró.

Consecuencias:

- Cuesta dos lecturas por petición autenticada, en paralelo y por índice (`_id`).
- Cerrar sesión, rotar el refresh token, desactivar la cuenta o cambiar la contraseña corta el acceso del token anterior
  al instante. Un cambio de rol aplica en la siguiente petición.
- Una conexión de tiempo real ya abierta no se corta: dura como mucho lo que su token (15 minutos). Los avisos no llevan
  datos, así que no se filtra información; queda pendiente cerrarla al desactivar.

### Propuestas: borrador incompleto y validación en dos niveles

- `ProposalDraftSchema` (crear) solo exige el nombre; lo no capturado se guarda como `null`. `UpdateProposalSchema`
  (editar) cambia solo lo enviado. `ProposalSubmitSchema` exige nombre, cliente, ubicación, tipo, alcance, fechas,
  presupuesto positivo, certificación objetivo, nivel si la certificación no es `none`, y materiales completos. Los tres
  viven en `packages/domain` y el cliente valida cada paso con `PROPOSAL_STEP_SCHEMAS`, que son piezas del de envío.
- La fecha de entrega debe ser posterior a la de inicio. Al editar se compara con la fecha ya guardada.
- Enviar valida lo guardado, no lo que diga el cliente. Si falta algo responde 400 `VALIDATION_ERROR` con el detalle por
  campo (el manejador de errores existente), no 409: el problema son los datos, no el estado. Lectura, validación y cambio
  de estado van en una transacción.
- El folio `PRO` se asigna al crear el borrador, dentro de la misma transacción.
- Editar fuera de `draft` responde 409 `NOT_EDITABLE`. Eliminar solo procede en `draft` o `rejected`; en `in_review` o
  `approved` responde 409 `INVALID_TRANSITION`. En ambos casos el estado va en el filtro de la escritura.
- Las metas de impacto son opcionales en la propuesta (`number | null`). Al aprobar, las que falten nacen en 0 en la obra.
- Los niveles de certificación son una lista fija (`CERTIFICATION_LEVELS`) con los valores que ya usaba el seed.

### Papelera

- `TenantRepository.scopedDeleted` es el contrario de `scoped`: tenant obligatorio y solo documentos con `deletedAt`. Lo
  usan únicamente los `restore` de obras y propuestas.
- `TrashRepository` lista obras y propuestas eliminadas con una agregación `$unionWith`, ambas ramas filtradas por tenant
  y sin montos. Cada usuario ve solo los tipos que puede restaurar. La ruta acepta cualquiera de los dos permisos con
  `requireAnyPermission`.
- Restaurar devuelve el documento como estaba: una obra archivada y luego eliminada vuelve a Archivadas, y una propuesta
  conserva su estado.
- Índice `{ tenantId, deletedAt: -1 }` en `projects` y `proposals`.

### Usuarios

- El alta por API es solo por invitación. Se retira `POST /users`, que creaba cuentas activas con contraseña;
  `IdentityService.createUser` se conserva para el seed y las pruebas.
- Las rutas `/users` exigen `identity.users:manage` y las de perfil `identity.profile:update`, en lugar de los permisos
  por acción `users.read` y `users.create`.
- Invitar crea la cuenta en `invited`, guarda el hash del token de invitación (7 días) y escribe la bitácora en una
  transacción. El correo se envía después y se espera su resultado: si no sale, la cuenta queda creada y la respuesta
  trae `emailSent: false` para que se pueda reenviar. Un correo ya registrado en cualquier tenant responde 409
  `EMAIL_IN_USE`.
- Reenviar genera un token nuevo; el anterior se borra (`createForUser` ya lo hacía).
- Solo se asignan los roles `admin` y `user` (`AssignableRoleSchema`); el enum de roles no cambia.
- **Último administrador**: "administrador" es una cuenta `active` cuyo rol tiene `identity.users:manage`. Quitarle el rol
  o desactivar al último responde 409 `LAST_ADMIN`. Para que dos cambios simultáneos no lo dejen sin administrador, la
  transacción empieza con `TenantsRepository.lock`, que escribe en el documento de la empresa y hace chocar a las demás
  (WriteConflict y reintento). Si el tenant no tenía registro de empresa, `lock` lo crea con el `tenantId` como nombre,
  que es lo mismo que ya mostraba `GET /me`.
- Desactivar revoca todas las sesiones (motivo `deactivated`) e invalida los enlaces pendientes. Reactivar una cuenta que
  nunca aceptó su invitación la deja en `invited`: no tiene contraseña y necesita un enlace nuevo.
- No existe eliminar usuario: el historial se conserva.
- Cambiar la contraseña exige la actual (400 `INVALID_CURRENT_PASSWORD`), aplica `PasswordSchema` y revoca las demás
  sesiones; la que hizo el cambio sigue viva. La ruta tiene el mismo freno por IP que el login.

### Bitácora

Propuestas y usuarios escriben en `auditLog` (`proposal.created`, `.updated`, `.submitted`, `.deleted`, `.restored`;
`project.restored`; `user.invited`, `.invitation_resent`, `.role_changed`, `.deactivated`, `.reactivated`,
`.profile_updated`, `.password_changed`). Los resúmenes no llevan montos, contraseñas ni tokens. Lo que el Bloque 1 ya
escribía en `audit_logs` (aceptar invitación, restablecer contraseña) no cambia.

### Cliente

- Se agregan `@react-native-community/datetimepicker` 8.0.0 (selector de fechas) y `@react-native-community/netinfo`
  11.4.1 (banner "Sin conexión"). Ambos son módulos nativos: hay que recompilar la app Android.
- No hay caché sin conexión: el banner avisa y las listas con error se vuelven a pedir al volver la red.
- `ApiError` conserva `details` para pintar cada error de la API junto a su campo.

## Pendiente

- Cerrar las conexiones de tiempo real abiertas de una cuenta al desactivarla.
- `GET /users/:id`: el detalle de usuario de la app parte del usuario de la lista.
- Notificaciones en el Perfil.
- Pantallas de construcción y administración en la web.
