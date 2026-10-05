import type { ServerConfig } from '@erp/config';
import type { EmailSender } from './email-sender';
import { NoopEmailSender } from './fake-email-sender';
import { ResendEmailSender } from './resend-email-sender';

export * from './email-sender';
export * from './fake-email-sender';
export * from './resend-email-sender';

/**
 * Remitente por defecto, con el nombre visible de la marca. `onboarding@resend.dev` es el remitente de pruebas de
 * Resend: solo entrega al correo dueño de la cuenta hasta verificar un dominio propio.
 */
export const DEFAULT_EMAIL_FROM = 'T-ssera Construcciones <onboarding@resend.dev>';

export function createEmailSender(config: ServerConfig): EmailSender {
  return config.resendApiKey ? new ResendEmailSender(config.resendApiKey, config.emailFrom ?? DEFAULT_EMAIL_FROM) : new NoopEmailSender();
}
