import { z } from 'zod';

const required = (name: string) => z.string({ required_error: `falta ${name}` }).trim().min(1, `falta ${name}`);

/** Empresa y cuentas iniciales. Salen siempre de variables de entorno, nunca de argumentos ni del código. */
export const SeedEnvSchema = z.object({
  SEED_TENANT_ID: required('SEED_TENANT_ID'),
  SEED_COMPANY_NAME: required('SEED_COMPANY_NAME'),
  SEED_ADMIN_EMAIL: required('SEED_ADMIN_EMAIL'),
  SEED_ADMIN_NAME: required('SEED_ADMIN_NAME'),
  SEED_ADMIN_PASSWORD: required('SEED_ADMIN_PASSWORD'),
  SEED_USER_EMAIL: required('SEED_USER_EMAIL'),
  SEED_USER_NAME: required('SEED_USER_NAME'),
  SEED_USER_PASSWORD: required('SEED_USER_PASSWORD'),
});
