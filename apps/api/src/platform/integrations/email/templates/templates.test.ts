import type { EmailMessage } from '../email-sender';
import { ResendEmailSender, type ResendClient } from '../resend-email-sender';
import { invitationEmail, passwordResetEmail, welcomeEmail } from './index';

const APP_WEB_URL = 'https://app.example.test';
const HOSTILE_NAME = '<script>alert("x")</script>';
const TOKEN = 'tok_en-123';

const emails: Record<string, { message: EmailMessage; link: string }> = {
  'restablecer contraseña': {
    message: passwordResetEmail({ to: 'ana@example.com', name: HOSTILE_NAME, token: TOKEN, appWebUrl: APP_WEB_URL, validMinutes: 60 }),
    link: `${APP_WEB_URL}/restablecer?token=${TOKEN}`,
  },
  invitación: {
    message: invitationEmail({
      to: 'ana@example.com', name: HOSTILE_NAME, companyName: 'Obras & <b>Hnos</b>', inviterName: 'Luis "el jefe"',
      roleLabel: 'Administrador', token: TOKEN, appWebUrl: APP_WEB_URL, validDays: 7,
    }),
    link: `${APP_WEB_URL}/activar?token=${TOKEN}`,
  },
  bienvenida: {
    message: welcomeEmail({ to: 'ana@example.com', name: HOSTILE_NAME, appWebUrl: APP_WEB_URL }),
    link: `${APP_WEB_URL}/entrar`,
  },
};

describe.each(Object.entries(emails))('correo de %s', (_name, { message, link }) => {
  it('lleva el logo como imagen en línea por CID, leído del repo', () => {
    expect(message.html).toContain('src="cid:tssera-logo"');
    expect(message.html).toContain('alt="T-ssera Construcciones"');
    expect(message.attachments).toHaveLength(1);
    const [logo] = message.attachments!;
    expect(logo).toMatchObject({ contentId: 'tssera-logo', contentType: 'image/png', filename: 'logo-lima.png' });
    const bytes = Buffer.from(logo!.content, 'base64');
    // Firma de un PNG real y peso ligero (menos de 20 KB).
    expect(bytes.subarray(1, 4).toString('latin1')).toBe('PNG');
    expect(bytes.length).toBeLessThan(20 * 1024);
  });

  it('usa los colores de marca y el pie con el tagline', () => {
    for (const color of ['#1F3D2B', '#B6FF5C', '#16150F', '#6B6B65', '#F7F7F2']) expect(message.html).toContain(color);
    expect(message.html).toContain('T-ssera Construcciones · Cada nivel, un paso más limpio.');
    expect(message.html).toContain('Recibes este correo porque');
  });

  it('enlaza solo a APP_WEB_URL, en el botón y como texto plano', () => {
    const hrefs = [...message.html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
    expect(hrefs).toEqual([link, link]);
    expect(message.html).toContain(`>${link}</a>`);
  });

  it('escapa los valores que vienen de usuarios', () => {
    expect(message.html).not.toContain('<script>');
    expect(message.html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
  });

  it('cumple las reglas del HTML para correo', () => {
    expect(message.html).toContain('max-width:600px');
    expect(message.html).toContain('role="presentation"');
    expect(message.html).toMatch(/<div style="display:none[^>]*>[^<]+<\/div>/); // preheader
    for (const forbidden of ['<script', '<svg', '<link', '<style', 'http://localhost']) expect(message.html).not.toContain(forbidden);
  });

  it('incluye la versión en texto plano con el enlace y sin HTML', () => {
    expect(message.text).toContain(link);
    expect(message.text).toContain('Cada nivel, un paso más limpio.');
    expect(message.text).not.toMatch(/<\/?(p|a|table|td|br)\b/);
  });

  it('no lleva contraseñas', () => {
    expect(`${message.html}${message.text}`).not.toMatch(/tu contraseña es|password:/i);
  });
});

describe('contenido propio de cada correo', () => {
  it('restablecer: vigencia y "si no lo pediste, ignora este correo"', () => {
    const { text } = emails['restablecer contraseña']!.message;
    expect(text).toContain('vence en 60 minutos');
    expect(text).toContain('Si no lo pediste, ignora este correo');
  });

  it('invitación: quién invita, a qué empresa, con qué rol y la vigencia; todo escapado', () => {
    const { html, text, subject } = emails['invitación']!.message;
    expect(subject).toBe('Luis "el jefe" te invitó a Obras & <b>Hnos</b>');
    expect(text).toContain('Luis "el jefe" te invitó al espacio de trabajo de Obras & <b>Hnos</b> con el rol de Administrador');
    expect(text).toContain('vence en 7 días');
    expect(html).toContain('Obras &amp; &lt;b&gt;Hnos&lt;/b&gt;');
    expect(html).toContain('Luis &quot;el jefe&quot;');
    expect(html).not.toContain('<b>Hnos</b>');
  });

  it('el token se codifica en la URL', () => {
    const { text } = passwordResetEmail({ to: 'a@example.com', name: 'Ana', token: 'a b&c', appWebUrl: APP_WEB_URL, validMinutes: 60 });
    expect(text).toContain(`${APP_WEB_URL}/restablecer?token=a%20b%26c`);
  });
});

describe('ResendEmailSender', () => {
  const message = emails['restablecer contraseña']!.message;
  const clientReturning = (result: unknown) => {
    const send = jest.fn().mockResolvedValue(result);
    return { send, client: { emails: { send } } as unknown as ResendClient };
  };

  it('envía remitente, texto y el logo como adjunto en línea con contentId', async () => {
    const { send, client } = clientReturning({ data: { id: 'email-1' }, error: null });
    await new ResendEmailSender('test-key', 'T-ssera Construcciones <onboarding@resend.dev>', client).send(message);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      from: 'T-ssera Construcciones <onboarding@resend.dev>',
      to: ['ana@example.com'],
      subject: message.subject,
      text: message.text,
      attachments: [expect.objectContaining({ contentId: 'tssera-logo', filename: 'logo-lima.png', content: expect.any(String) })],
    }));
  });

  it('Resend no lanza: si devuelve `error`, el envío falla con su mensaje', async () => {
    const { client } = clientReturning({ data: null, error: { name: 'validation_error', message: 'You can only send testing emails to your own email address' } });
    await expect(new ResendEmailSender('test-key', 'x <onboarding@resend.dev>', client).send(message))
      .rejects.toThrow('validation_error');
  });
});
