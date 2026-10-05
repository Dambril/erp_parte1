import { logger } from '../../../config/logger';
import type { EmailMessage, EmailSender } from './email-sender';

/** Implementación falsa para las pruebas: no envía nada y guarda los mensajes para poder revisarlos. */
export class FakeEmailSender implements EmailSender {
  readonly sent: EmailMessage[] = [];

  async send(message: EmailMessage): Promise<void> {
    this.sent.push(message);
  }
}

/** Sin API key (local, seed): no envía nada y deja constancia en el log, sin volcar el contenido (lleva tokens). */
export class NoopEmailSender implements EmailSender {
  async send({ subject }: EmailMessage): Promise<void> {
    logger.debug('Email not sent: RESEND_API_KEY is not configured', { subject });
  }
}
