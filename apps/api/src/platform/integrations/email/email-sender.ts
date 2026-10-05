import { logger } from '../../../config/logger';

/** Imagen embebida en el correo: el HTML la referencia con `src="cid:<contentId>"`. */
export interface InlineAttachment {
  filename: string;
  contentType: string;
  contentId: string;
  /** Contenido en base64. */
  content: string;
}

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  /** Versión en texto plano, para clientes que no muestran HTML. */
  text: string;
  attachments?: InlineAttachment[];
}

/** Los módulos de negocio dependen de esta interfaz, no de Resend: se puede cambiar de proveedor o simular en pruebas. */
export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

/**
 * Un fallo del proveedor no debe romper la operación del usuario: se registra (sin destinatario ni contenido) y se sigue.
 * Devuelve `false` si el correo no salió, para quien necesite avisarlo (invitaciones).
 */
export async function sendEmailSafely(sender: EmailSender, message: EmailMessage): Promise<boolean> {
  try {
    await sender.send(message);
    return true;
  } catch (error) {
    logger.error('Failed to send email', { subject: message.subject, error: error instanceof Error ? error.message : String(error) });
    return false;
  }
}
