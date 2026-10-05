/**
 * Envía un ejemplo de cada correo a la dirección indicada, con Resend y las variables de .env.local
 * (RESEND_API_KEY, EMAIL_FROM y APP_WEB_URL). Los enlaces llevan un token de ejemplo que no sirve.
 *
 *   pnpm --filter @erp/api email:test -- tu-correo@ejemplo.com
 *
 * Con el remitente de pruebas `onboarding@resend.dev`, Resend solo entrega al correo dueño de la cuenta de Resend.
 */
import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';
import { DEFAULT_EMAIL_FROM, ResendEmailSender } from '../platform/integrations/email';
import { sampleEmails } from './email-samples';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env.local') });

async function run(): Promise<void> {
  // pnpm pasa el separador `--` como un argumento más.
  const to = z.string().email('Indica un correo válido: pnpm --filter @erp/api email:test -- tu-correo@ejemplo.com')
    .parse(process.argv.slice(2).find((arg) => arg !== '--'));
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('Falta RESEND_API_KEY en .env.local');
  const from = process.env.EMAIL_FROM || DEFAULT_EMAIL_FROM;
  const appWebUrl = (process.env.APP_WEB_URL || 'http://localhost:5173').replace(/\/+$/, '');

  const sender = new ResendEmailSender(apiKey, from);
  console.log(`Remitente: ${from}\nEnlaces hacia: ${appWebUrl}`);
  let failed = 0;
  for (const { name, message } of sampleEmails(to, appWebUrl)) {
    try {
      await sender.send(message);
      console.log(`✔ ${name}: enviado a ${to}`);
    } catch (error) {
      failed += 1;
      console.error(`✘ ${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (failed) process.exitCode = 1;
}

run().catch((error) => {
  console.error(error instanceof z.ZodError ? error.issues[0]?.message : error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
