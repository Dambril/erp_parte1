export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const MENSAJES: Record<string, string> = {
  NETWORK_ERROR: 'Sin conexión. Revisa tu internet e inténtalo de nuevo.',
  INVALID_CREDENTIALS: 'Correo o contraseña incorrectos',
  TOO_MANY_ATTEMPTS: 'Demasiados intentos. Vuelve a intentarlo en 5 minutos.',
  TOO_MANY_REQUESTS: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.',
  INVALID_REFRESH_TOKEN: 'Tu sesión expiró. Vuelve a iniciar sesión.',
  REFRESH_TOKEN_REUSED: 'Por seguridad cerramos tu sesión. Vuelve a iniciar sesión.',
  VALIDATION_ERROR: 'Revisa los datos: hay campos incompletos o con formato inválido.',
  FORBIDDEN: 'Tu rol no tiene permiso para esta acción.',
  UNAUTHENTICATED: 'Tu sesión expiró. Vuelve a iniciar sesión.',
  INVALID_TOKEN: 'Tu sesión expiró. Vuelve a iniciar sesión.',
  PROJECT_NOT_FOUND: 'La obra ya no existe.',
  PROPOSAL_NOT_FOUND: 'La propuesta ya no existe.',
  MOVEMENT_NOT_FOUND: 'El movimiento a corregir ya no existe.',
  REQUIREMENT_NOT_FOUND: 'La obra no tiene ese requisito de certificación.',
};

export function esErrorDeRed(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'NETWORK_ERROR';
}

/** Mensaje en español para mostrar al usuario a partir de cualquier error del cliente. */
export function mensajeError(error: unknown): string {
  if (error instanceof ApiError) {
    // INVALID_TOKEN con 400 es un enlace de correo (restablecer, invitación); con 401, un access token vencido.
    if (error.code === 'INVALID_TOKEN' && error.status === 400) return 'El enlace no es válido o ya venció. Solicita uno nuevo.';
    if (MENSAJES[error.code]) return MENSAJES[error.code];
    // Los errores de reglas de negocio (409) ya vienen redactados en español por la API.
    if (error.status === 409) return error.message;
    if (error.status >= 500) return 'El servidor tuvo un problema. Intenta de nuevo en un momento.';
  }
  return 'Ocurrió un error inesperado.';
}
