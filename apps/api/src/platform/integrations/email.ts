import type { ServerConfig } from '@erp/config';
import { logger } from '../../config/logger';

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/** Los módulos de negocio dependen de esta interfaz, no de Resend: se puede cambiar de proveedor o simular en pruebas. */
export interface Mailer {
  send(message: EmailMessage): Promise<void>;
}

// Remitente de pruebas de Resend: solo entrega al correo dueño de la cuenta hasta verificar un dominio propio.
const DEFAULT_FROM = 'ERP <onboarding@resend.dev>';

/** Usa la API HTTPS de Resend (no SMTP), que funciona también en el plan gratuito de Render. */
export class ResendMailer implements Mailer {
  public constructor(private readonly apiKey: string, private readonly from: string) {}

  async send({ to, subject, html, text }: EmailMessage): Promise<void> {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: this.from, to: [to], subject, html, text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Resend responded ${response.status}: ${await response.text()}`);
  }
}

/** Sin API key (local, pruebas): no envía nada y deja constancia en el log, sin volcar el contenido. */
export class NoopMailer implements Mailer {
  async send({ to, subject }: EmailMessage): Promise<void> {
    logger.debug('Email not sent: RESEND_API_KEY is not configured', { to, subject });
  }
}

export function createMailer(config: ServerConfig): Mailer {
  return config.resendApiKey ? new ResendMailer(config.resendApiKey, config.emailFrom ?? DEFAULT_FROM) : new NoopMailer();
}

/** Un fallo del proveedor no debe romper la operación del usuario: se registra y se sigue. */
export async function sendEmailSafely(mailer: Mailer, message: EmailMessage): Promise<void> {
  try {
    await mailer.send(message);
  } catch (error) {
    logger.error('Failed to send email', { to: message.to, subject: message.subject, error: error instanceof Error ? error.message : String(error) });
  }
}
