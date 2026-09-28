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
  redisUrl: z.string().url('REDIS_URL must be a valid URL'),
  defaultTenantId: z.string().min(1, 'DEFAULT_TENANT_ID is required'),
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
    redisUrl: env.REDIS_URL,
    defaultTenantId: env.DEFAULT_TENANT_ID,
  });
}
