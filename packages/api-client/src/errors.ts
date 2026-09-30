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
  NETWORK_ERROR: 'No se pudo conectar con el servidor. Revisa tu conexión.',
  INVALID_CREDENTIALS: 'Correo o contraseña incorrectos.',
  TOO_MANY_REQUESTS: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.',
  VALIDATION_ERROR: 'Revisa los datos: hay campos incompletos o con formato inválido.',
  FORBIDDEN: 'Tu rol no tiene permiso para esta acción.',
  UNAUTHENTICATED: 'Tu sesión expiró. Vuelve a iniciar sesión.',
  INVALID_TOKEN: 'Tu sesión expiró. Vuelve a iniciar sesión.',
  OBRA_NOT_FOUND: 'La obra ya no existe.',
  OBRA_MODIFICADA: 'Alguien más modificó la obra al mismo tiempo. Intenta de nuevo.',
};

/** Mensaje en español para mostrar al usuario a partir de cualquier error del cliente. */
export function mensajeError(error: unknown): string {
  if (error instanceof ApiError) {
    if (MENSAJES[error.code]) return MENSAJES[error.code];
    // Los errores de reglas de negocio (409) ya vienen redactados en español por la API.
    if (error.status === 409) return error.message;
    if (error.status >= 500) return 'El servidor tuvo un problema. Intenta de nuevo en un momento.';
  }
  return 'Ocurrió un error inesperado.';
}
