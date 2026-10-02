import type { EmailMessage } from '../../platform/integrations/email';

const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function welcomeEmail(to: string, name: string): EmailMessage {
  return {
    to,
    subject: 'Tu cuenta fue creada',
    text: `Hola ${name}, tu cuenta del ERP fue creada. Ya puedes iniciar sesión con este correo (${to}).`,
    html: `<p>Hola ${escapeHtml(name)},</p><p>Tu cuenta del ERP fue creada. Ya puedes iniciar sesión con este correo (${escapeHtml(to)}).</p>`,
  };
}

/** `appWebUrl` sin barra final; el enlace abre la pantalla "Crear contraseña nueva" de la web. */
export function passwordResetEmail(to: string, name: string, token: string, appWebUrl: string, validMinutes: number): EmailMessage {
  const link = `${appWebUrl}/restablecer?token=${encodeURIComponent(token)}`;
  const button = 'display:inline-block;padding:12px 24px;background:#111111;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600';
  return {
    to,
    subject: 'Restablece tu contraseña',
    text: [
      `Hola ${name},`,
      'Recibimos una solicitud para restablecer tu contraseña. Abre este enlace para crear una nueva:',
      link,
      `El enlace vence en ${validMinutes} minutos.`,
      'Si no lo pediste, ignora este correo.',
    ].join('\n\n'),
    html: `<!doctype html>
<html lang="es">
  <body style="margin:0;padding:24px;font-family:Arial,Helvetica,sans-serif;color:#111111">
    <p>Hola ${escapeHtml(name)},</p>
    <p>Recibimos una solicitud para restablecer tu contraseña.</p>
    <p style="margin:24px 0"><a href="${escapeHtml(link)}" style="${button}">Restablecer contraseña</a></p>
    <p>El enlace vence en ${validMinutes} minutos.</p>
    <p style="color:#555555">Si no lo pediste, ignora este correo.</p>
  </body>
</html>`,
  };
}
