"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.serverConfigSchema = void 0;
exports.loadConfig = loadConfig;
const zod_1 = require("zod");
exports.serverConfigSchema = zod_1.z.object({
    nodeEnv: zod_1.z.enum(['development', 'test', 'production']).default('development'),
    port: zod_1.z.coerce.number().default(3000),
    mongodbUri: zod_1.z.string().min(1, 'MONGODB_URI is required'),
    mongodbDbName: zod_1.z.string().min(1).optional(),
    jwtSecret: zod_1.z.string().min(8, 'JWT_SECRET must be at least 8 characters'),
    jwtExpiresIn: zod_1.z.string().default('15m'),
    jwtRefreshSecret: zod_1.z.string().min(8, 'JWT_REFRESH_SECRET must be at least 8 characters'),
    jwtRefreshExpiresIn: zod_1.z.string().default('7d'),
    redisUrl: zod_1.z.string().url('REDIS_URL must be a valid URL'),
    defaultTenantId: zod_1.z.string().min(1, 'DEFAULT_TENANT_ID is required'),
});
function loadConfig(env = process.env) {
    return exports.serverConfigSchema.parse({
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
