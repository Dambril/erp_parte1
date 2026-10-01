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

export function passwordResetEmail(to: string, name: string, token: string, resetUrl: string | undefined, validMinutes: number): EmailMessage {
  const link = resetUrl ? `${resetUrl}${resetUrl.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}` : undefined;
  const textAction = link ? `Restablece tu contraseña aquí: ${link}` : `Tu código de restablecimiento es: ${token}`;
  const htmlAction = link
    ? `<p><a href="${escapeHtml(link)}">Restablecer contraseña</a></p>`
    : `<p>Tu código de restablecimiento es:</p><p><code>${escapeHtml(token)}</code></p>`;
  return {
    to,
    subject: 'Restablece tu contraseña',
    text: `Hola ${name}, recibimos una solicitud para restablecer tu contraseña. ${textAction}\nVence en ${validMinutes} minutos. Si no la pediste, ignora este correo.`,
    html: `<p>Hola ${escapeHtml(name)},</p><p>Recibimos una solicitud para restablecer tu contraseña.</p>${htmlAction}<p>Vence en ${validMinutes} minutos. Si no la pediste, ignora este correo.</p>`,
  };
}
