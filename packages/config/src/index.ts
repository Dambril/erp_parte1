import { z } from 'zod';

export const serverConfigSchema = z.object({
  nodeEnv: z.enum(['development', 'test', 'production']).default('development'),
  port: z.coerce.number().default(3000),
  mongodbUri: z.string().min(1, 'MONGODB_URI is required'),
  mongodbDbName: z.string().min(1).optional(),
  jwtSecret: z.string().min(8, 'JWT_SECRET must be at least 8 characters'),
  jwtExpiresIn: z.string().default('15m'),
  // Opcional mientras no haya jobs de BullMQ; hacerlo obligatorio al introducir colas.
  redisUrl: z.string().url('REDIS_URL must be a valid URL').optional(),
  // Correo transaccional (Resend). Sin API key los correos no se envían, solo se registra en el log.
  resendApiKey: z.string().min(1).optional(),
  // Remitente; por defecto el de pruebas de Resend, que solo entrega al correo dueño de la cuenta.
  emailFrom: z.string().min(1).optional(),
  // URL pública de la web: los correos enlazan a `${APP_WEB_URL}/restablecer?token=...` y `/activar?token=...`.
  appWebUrl: z.string({ required_error: 'APP_WEB_URL is required in production' })
    .url('APP_WEB_URL must be a valid URL').transform((url) => url.replace(/\/+$/, '')),
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
    redisUrl: env.REDIS_URL || undefined,
    resendApiKey: env.RESEND_API_KEY || undefined,
    emailFrom: env.EMAIL_FROM || undefined,
    // Fuera de producción, la web local de Vite.
    appWebUrl: env.APP_WEB_URL || (env.NODE_ENV === 'production' ? undefined : 'http://localhost:5173'),
    defaultTenantId: env.DEFAULT_TENANT_ID,
    corsOrigins: env.CORS_ORIGINS
      ? env.CORS_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean)
      : undefined,
  });
}
