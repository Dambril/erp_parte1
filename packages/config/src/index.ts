import { z } from 'zod';

export const serverConfigSchema = z.object({
  nodeEnv: z.enum(['development', 'test', 'production']).default('development'),
  port: z.coerce.number().default(3000),
  mongodbUri: z.string().min(1, 'MONGODB_URI is required'),
  mongodbDbName: z.string().min(1).optional(),
  jwtSecret: z.string().min(8, 'JWT_SECRET must be at least 8 characters'),
  jwtExpiresIn: z.string().default('15m'),
  jwtRefreshSecret: z.string().min(8, 'JWT_REFRESH_SECRET must be at least 8 characters'),
  jwtRefreshExpiresIn: z.string().default('7d'),
  // Opcional mientras no haya jobs de BullMQ; hacerlo obligatorio al introducir colas.
  redisUrl: z.string().url('REDIS_URL must be a valid URL').optional(),
  // Correo transaccional (Resend). Sin API key los correos no se envían, solo se registra en el log.
  resendApiKey: z.string().min(1).optional(),
  // Remitente; por defecto el de pruebas de Resend, que solo entrega al correo dueño de la cuenta.
  emailFrom: z.string().min(1).optional(),
  // URL de la pantalla de restablecer contraseña; el correo añade ?token=... Si falta, el correo solo trae el código.
  passwordResetUrl: z.string().url('PASSWORD_RESET_URL must be a valid URL').optional(),
  defaultTenantId: z.string().min(1, 'DEFAULT_TENANT_ID is required'),
  // Orígenes web permitidos por CORS. Vacío: en desarrollo se permite cualquiera; en producción, ninguno.
  // Las apps nativas no envían Origin, así que no dependen de esta lista.
  corsOrigins: z.array(z.string().url('CORS_ORIGINS must be a comma-separated list of URLs')).default([]),
});

export type ServerConfig = z.infer<typeof serverConfigSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  return serverConfigSchema.parse({
    nodeEnv: env.NODE_ENV,
    port: env.PORT,
    mongodbUri: env.MONGODB_URI,
    mongodbDbName: env.MONGODB_DB_NAME || undefined,
    jwtSecret: env.JWT_SECRET,
    jwtExpiresIn: env.JWT_EXPIRES_IN,
    jwtRefreshSecret: env.JWT_REFRESH_SECRET,
    jwtRefreshExpiresIn: env.JWT_REFRESH_EXPIRES_IN,
    redisUrl: env.REDIS_URL || undefined,
    resendApiKey: env.RESEND_API_KEY || undefined,
    emailFrom: env.EMAIL_FROM || undefined,
    passwordResetUrl: env.PASSWORD_RESET_URL || undefined,
    defaultTenantId: env.DEFAULT_TENANT_ID,
    corsOrigins: env.CORS_ORIGINS
      ? env.CORS_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean)
      : undefined,
  });
}
