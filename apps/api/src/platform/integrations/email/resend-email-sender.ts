import { Resend } from 'resend';
import type { EmailMessage, EmailSender } from './email-sender';

/** Lo único que se usa del SDK; permite sustituirlo en las pruebas. */
export type ResendClient = Pick<Resend, 'emails'>;

export class ResendEmailSender implements EmailSender {
  private readonly client: ResendClient;

  public constructor(apiKey: string, private readonly from: string, client?: ResendClient) {
    this.client = client ?? new Resend(apiKey);
  }

  async send({ to, subject, html, text, attachments }: EmailMessage): Promise<void> {
    // El SDK de Resend no lanza excepciones: devuelve `{ data, error }` y hay que revisar `error` en cada envío.
    const { error } = await this.client.emails.send({
      from: this.from,
      to: [to],
      subject,
      html,
      text,
      attachments: attachments?.map(({ filename, contentType, contentId, content }) => ({ filename, contentType, contentId, content })),
    });
    if (error) throw new Error(`Resend rejected the email (${error.name}): ${error.message}`);
  }
}
