# ADR 0002: Catálogos e inventario

## Estado

Aceptada para la fase 1B.

## Contexto

La fase 1B agrega los catálogos (unidades, impuestos, monedas, categorías, productos, clientes, proveedores y almacenes) y el inventario. El inventario exige exactitud decimal, inmutabilidad y consistencia bajo concurrencia sobre MongoDB. La fase 1A dejó el RBAC por rol y la auditoría como contrato sin implementar. Este ADR registra cómo se resolvieron ambos puntos sin rehacer la 1A.

## Decisiones

### Nombres

- Campos en inglés camelCase y colecciones en snake_case, igual que `users` y `refresh_tokens`: `products`, `product_categories`, `inventory_movements`, `stock_levels`, `lots`, `folio_counters`, `tenant_settings` y `audit_logs`. Los campos del requerimiento `productoId` y `almacenId` son `productId` y `warehouseId`.

### Decimales

- Cantidades, costos, precios y tasas se guardan como `Decimal128` y viajan en la API como texto decimal (`"0.3"`). Un `number` en el cuerpo de la petición se rechaza con 400.
- La aritmética de existencias la hace el servidor de Mongo (`$inc` y `$sum` sobre `Decimal128` son exactos). En la aplicación, `core/decimal.ts` (entero escalado con `BigInt`, sin dependencias) valida la escala, compara y calcula el saldo del kardex.
- La cantidad de un movimiento no puede tener más decimales que los que permite la unidad del producto (`decimals`).

### Transacciones

- `withTransaction` (`config/database.ts`) abre una sesión con `readConcern: snapshot` y `writeConcern: majority`. Reintenta la transacción completa ante `TransientTransactionError` (incluye `WriteConflict`) y reintenta el commit ante `UnknownTransactionCommitResult`, con hasta 25 intentos y espera creciente con jitter.
- Solo se usan transacciones en inventario: movimiento, folio, existencia y lote. Los catálogos son escrituras de un solo documento.

### Concurrencia y política de stock negativo

- Por defecto se rechaza cualquier salida que deje la existencia bajo cero (`409 INSUFFICIENT_STOCK`). La política se configura por tenant en `tenant_settings.inventory.allowNegativeStock` (`PUT /inventory/settings`, solo admin).
- Con la política de rechazo, la salida es una única actualización condicional dentro de la transacción: `updateOne({ ...clave, quantity: { $gte: salida } }, { $inc: { quantity: -salida } })`. Si no coincide ningún documento, se lanza el error y la transacción aborta, así que no queda movimiento, folio ni cambio de existencia.
- Condiciones de carrera: dos transacciones que escriben el mismo documento de `stock_levels` (o el contador de folios) chocan con un `WriteConflict`. Mongo aborta una de ellas y `withTransaction` la reintenta con una instantánea nueva. En el reintento, la condición `$gte` se evalúa sobre la existencia ya descontada. Nunca se lee la existencia para decidir en la aplicación y luego escribir, por eso no hay ventana de carrera.
- Cuando dos transacciones crean a la vez el mismo documento con upsert (primera existencia de un producto en un almacén, primer folio o primer lote), el choque en el índice único se convierte en `TransactionConflictError`, que también se reintenta.

### Folios

- Contador `folio_counters` con `_id = "<tenantId>:<serie>"`, incrementado con `findOneAndUpdate($inc)` dentro de la misma transacción que el movimiento. Si la transacción aborta, el incremento también se revierte, así que no hay huecos. Tampoco hay duplicados: el índice único `{ tenantId, folio }` lo garantiza.
- Serie única `MOV` para movimientos. El folio se expone como `MOV-<n>` y además como `number`. Como el contador serializa las transacciones, el orden de folio coincide con el orden de commit, y el kardex se ordena por folio.

### Movimientos inmutables, traspasos y reversas

- `inventory_movements` es la fuente de verdad y solo admite inserción: el repository no tiene métodos para modificar ni borrar y no existen rutas PUT, PATCH ni DELETE sobre movimientos. `stock_levels` es una caché derivada que solo escribe `InventoryService`, siempre en la misma transacción que el movimiento que la respalda.
- Tipos: `entry`, `exit`, `adjustment` (con signo), `transfer_out`/`transfer_in` y `reversal`. La cantidad es positiva cuando entra y negativa cuando sale.
- Traspaso: dos movimientos con el mismo `transferId` en una sola transacción. Si cualquiera de las dos partes falla, no queda nada.
- Reversa: movimiento `reversal` con la cantidad inversa y `reversedMovementId` apuntando al original. No se puede revertir una reversa. El índice único parcial `{ tenantId, reversedMovementId }` garantiza en la base que nada se revierta dos veces, incluso con peticiones simultáneas. Revertir cualquiera de las dos patas de un traspaso revierte el traspaso completo. Una reversa que dejaría existencia negativa sigue la política de stock negativo.
- Los servicios (`type: 'service'`) no generan movimientos. Los productos o almacenes inactivos no aceptan movimientos nuevos, pero sí reversas.
- `recordMovement(input, ctx, session?)` acepta la sesión de quien llama para que compras y ventas (fase 1C) registren su documento y el movimiento en una sola transacción.
- Costo unitario: el que llega en la petición o, si no llega, `product.cost`. El método de costeo (promedio o PEPS) queda fuera de esta fase.

### Lotes y series

- La colección `lots` guarda lotes y números de serie (`kind: 'lot' | 'serial'`). Ambos usan `lotId` en movimientos y existencias, de modo que el índice único `{ tenantId, productId, warehouseId, lotId }` sirve para los dos.
- Un producto con seguimiento exige `lotCode` o `serialNumber`; uno sin seguimiento los rechaza. Las entradas crean el lote o la serie si no existe; las salidas y los traspasos lo exigen existente.
- Una serie se mueve de a una pieza. Dentro de la transacción se suma su existencia en todos los almacenes: si pasa de 1 se aborta (`SERIAL_ALREADY_IN_STOCK`), y nunca baja de 0 aunque el tenant permita stock negativo.

### Reconciliación

- `InventoryService.reconcile` agrupa los movimientos por producto, almacén y lote con `$sum` y compara el resultado con `stock_levels`. Un registro ausente cuenta como 0. Solo reporta y nunca corrige. Se expone en `GET /inventory/reconciliation` (solo admin) y en el script `reconcile-inventory`, que sale con código 2 si hay diferencias.

### Permisos

- Se extendió el RBAC de la 1A en lugar de crear una colección de permisos. `PERMISSION_CATALOG` (`packages/domain`) es el registro (seed) de permisos `módulo.acción`, por ejemplo `catalogs.product.create` o `inventory.reversal.create`, y `requirePermission` solo acepta combinaciones de ese catálogo. Qué rol puede cada acción lo sigue decidiendo la matriz de roles de `permissions.ts`.
- `inventory.settings` e `inventory.reconciliation` son solo para admin. Con la matriz actual, todos los roles tienen `read`, así que los endpoints de lectura no producen 403 para ningún rol autenticado.

### Auditoría

- `core/audit.ts` implementa la bitácora `audit_logs`, de solo inserción: `actorId`, `action`, `entity`, `entityId`, `before`, `after` y `occurredAt`. La invocan los servicios después de cada alta, cambio o baja de catálogo, y al cambiar la política de inventario. Para inventario, el propio movimiento inmutable (con `userId` y `createdAt`) es la bitácora. `auditMiddleware` sigue siendo un contrato sin implementación.
- La escritura de auditoría de catálogos no va en la misma transacción que el cambio: si el proceso cae entre ambas operaciones, el cambio puede quedar sin registro. Se aceptó para no usar transacciones fuera de operaciones críticas.

### Catálogos

- Códigos y SKU son únicos por tenant incluso entre registros borrados. Un código dado de baja no se reutiliza, para que el historial no se preste a confusión.
- `type`, `tracking` y `unitId` de un producto no se pueden cambiar después de crearlo (el PATCH responde 400). Cambiarlos alteraría el significado de los movimientos existentes.
- No se puede dar de baja una unidad, un impuesto, una moneda o una categoría en uso, ni un producto o almacén con existencia distinta de cero.
- La búsqueda `?q=` es una expresión regular literal (escapada) que no distingue mayúsculas. Para volúmenes grandes habrá que evaluar un índice de texto o Atlas Search.

### Índices

- Todos empiezan por `tenantId` y los crea `ensureIndexes` (`apps/api/src/indexes.ts`) en cada arranque, en los scripts (`seed`) y en las pruebas. Nunca se crean a mano en Atlas.

## Consecuencias

- Las pruebas de inventario usan `MongoMemoryReplSet`, porque las transacciones solo existen en replica sets. Así ejercitan el mismo camino que Atlas.
- El contador de folios es un punto de contención por tenant: cada movimiento lo escribe. Es aceptable para el volumen esperado. Si llegara a ser un cuello de botella, la alternativa es asignar folios por rangos o por sucursal.
- Pendientes: método de costeo, políticas de caducidad de lotes, reglas fiscales por país para impuestos y un ajuste masivo para corregir las diferencias que reporte la reconciliación.
