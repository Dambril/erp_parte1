import { z } from 'zod';
export declare const serverConfigSchema: z.ZodObject<{
    nodeEnv: z.ZodDefault<z.ZodEnum<["development", "test", "production"]>>;
    port: z.ZodDefault<z.ZodNumber>;
    mongodbUri: z.ZodString;
    mongodbDbName: z.ZodOptional<z.ZodString>;
    jwtSecret: z.ZodString;
    jwtExpiresIn: z.ZodDefault<z.ZodString>;
    jwtRefreshSecret: z.ZodString;
    jwtRefreshExpiresIn: z.ZodDefault<z.ZodString>;
    redisUrl: z.ZodString;
    defaultTenantId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    nodeEnv: "development" | "test" | "production";
    port: number;
    mongodbUri: string;
    jwtSecret: string;
    jwtExpiresIn: string;
    jwtRefreshSecret: string;
    jwtRefreshExpiresIn: string;
    redisUrl: string;
    defaultTenantId: string;
    mongodbDbName?: string | undefined;
}, {
    mongodbUri: string;
    jwtSecret: string;
    jwtRefreshSecret: string;
    redisUrl: string;
    defaultTenantId: string;
    nodeEnv?: "development" | "test" | "production" | undefined;
    port?: number | undefined;
    mongodbDbName?: string | undefined;
    jwtExpiresIn?: string | undefined;
    jwtRefreshExpiresIn?: string | undefined;
}>;
export type ServerConfig = z.infer<typeof serverConfigSchema>;
export declare function loadConfig(env?: NodeJS.ProcessEnv): ServerConfig;
