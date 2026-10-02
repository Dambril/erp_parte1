import type { ServerConfig } from '@erp/config';
import { logger } from '../../config/logger';

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/** Los módulos de negocio dependen de esta interfaz, no de Resend: se puede cambiar de proveedor o simular en pruebas. */
export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

// Remitente de pruebas de Resend: solo entrega al correo dueño de la cuenta hasta verificar un dominio propio.
const DEFAULT_FROM = 'ERP <onboarding@resend.dev>';

/** Usa la API HTTPS de Resend (no SMTP), que funciona también en el plan gratuito de Render. */
export class ResendEmailSender implements EmailSender {
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

/** Sin API key (local, pruebas): no envía nada y deja constancia en el log, sin volcar el contenido (lleva tokens). */
export class NoopEmailSender implements EmailSender {
  async send({ subject }: EmailMessage): Promise<void> {
    logger.debug('Email not sent: RESEND_API_KEY is not configured', { subject });
  }
}

export function createEmailSender(config: ServerConfig): EmailSender {
  return config.resendApiKey ? new ResendEmailSender(config.resendApiKey, config.emailFrom ?? DEFAULT_FROM) : new NoopEmailSender();
}

/** Un fallo del proveedor no debe romper la operación del usuario: se registra (sin destinatario ni contenido) y se sigue. */
export async function sendEmailSafely(sender: EmailSender, message: EmailMessage): Promise<void> {
  try {
    await sender.send(message);
  } catch (error) {
    logger.error('Failed to send email', { subject: message.subject, error: error instanceof Error ? error.message : String(error) });
  }
}
