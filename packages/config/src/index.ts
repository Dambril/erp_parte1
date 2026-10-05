import { z } from 'zod';

export const serverConfigSchema = z.object({
  nodeEnv: z.enum(['development', 'test', 'production']).default('development'),
  port: z.coerce.number().default(3000),
  mongodbUri: z.string().regex(/^mongodb(\+srv)?:\/\//, 'debe empezar con mongodb:// o mongodb+srv://'),
  mongodbDbName: z.string().min(1).optional(),
  jwtSecret: z.string().min(8, 'debe tener al menos 8 caracteres (genera uno con: openssl rand -base64 48)'),
  jwtExpiresIn: z.string().default('15m'),
  // Opcional mientras no haya jobs de BullMQ; hacerlo obligatorio al introducir colas.
  redisUrl: z.string().url('debe ser una URL válida, p. ej. redis://localhost:6379').optional(),
  // Correo transaccional (Resend). Sin API key los correos no se envían, solo se registra en el log.
  resendApiKey: z.string().min(1).optional(),
  // Remitente con nombre visible, p. ej. `T-ssera Construcciones <onboarding@resend.dev>`. Ese remitente de pruebas
  // de Resend solo entrega al correo dueño de la cuenta.
  emailFrom: z.string().regex(/^.+<[^<>\s]+@[^<>\s]+>$|^[^<>\s]+@[^<>\s]+$/, 'debe ser "Nombre <correo@dominio>" o un correo').optional(),
  // URL pública de la web: los correos enlazan a `${APP_WEB_URL}/restablecer?token=...` y `/activar?token=...`.
  appWebUrl: z.string({ required_error: 'es obligatoria en producción' })
    .url('debe ser una URL válida').transform((url) => url.replace(/\/+$/, '')),
  defaultTenantId: z.string().min(1),
  // Orígenes web permitidos por CORS. Vacío: en desarrollo se permite cualquiera; en producción, ninguno.
  // Las apps nativas no envían Origin, así que no dependen de esta lista.
  corsOrigins: z.array(z.string().url('debe ser una lista de URLs separadas por comas')).default([]),
});

export type ServerConfig = z.infer<typeof serverConfigSchema>;

/** Variable de entorno de la que sale cada campo, para nombrarla en los mensajes de error. */
const ENV_NAMES: Record<keyof ServerConfig, string> = {
  nodeEnv: 'NODE_ENV',
  port: 'PORT',
  mongodbUri: 'MONGODB_URI',
  mongodbDbName: 'MONGODB_DB_NAME',
  jwtSecret: 'JWT_SECRET',
  jwtExpiresIn: 'JWT_EXPIRES_IN',
  redisUrl: 'REDIS_URL',
  resendApiKey: 'RESEND_API_KEY',
  emailFrom: 'EMAIL_FROM',
  appWebUrl: 'APP_WEB_URL',
  defaultTenantId: 'DEFAULT_TENANT_ID',
  corsOrigins: 'CORS_ORIGINS',
};

/** Variables de entorno ausentes o inválidas. El mensaje nombra cada variable, nunca su valor. */
export class ConfigError extends Error {
  public constructor(public readonly problems: string[]) {
    super(`Configuración inválida. Revisa .env.local (plantilla: .env.example):\n${problems.map((problem) => `  - ${problem}`).join('\n')}`);
    this.name = 'ConfigError';
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const result = serverConfigSchema.safeParse({
    nodeEnv: env.NODE_ENV,
    port: env.PORT,
    mongodbUri: env.MONGODB_URI,
    mongodbDbName: env.MONGODB_DB_NAME || undefined,
    jwtSecret: env.JWT_SECRET,
    jwtExpiresIn: env.JWT_EXPIRES_IN || undefined,
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
  if (result.success) return result.data;

  throw new ConfigError(result.error.issues.map((issue) => {
    const name = ENV_NAMES[issue.path[0] as keyof ServerConfig] ?? String(issue.path[0]);
    const missing = issue.code === 'invalid_type' && issue.received === 'undefined';
    return `${name}: ${missing && issue.message === 'Required' ? 'falta' : issue.message}`;
  }));
}
