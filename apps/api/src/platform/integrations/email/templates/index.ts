import type { EmailMessage } from '../email-sender';
import { renderEmail } from './layout';

/**
 * Plantillas de los correos del sistema. Todas usan el layout compartido y el tono de docs/marca/identidad.md:
 * directo y cercano, sin superlativos. Los enlaces se arman solo con `appWebUrl` (la `APP_WEB_URL` de la
 * configuración, sin barra final) y ningún correo lleva contraseñas.
 */

export interface PasswordResetEmailInput {
  to: string;
  name: string;
  token: string;
  appWebUrl: string;
  validMinutes: number;
}

/** El enlace abre la pantalla "Crear contraseña nueva" de la web. */
export function passwordResetEmail({ to, name, token, appWebUrl, validMinutes }: PasswordResetEmailInput): EmailMessage {
  return renderEmail({
    to,
    subject: 'Restablece tu contraseña de T-ssera',
    preheader: `Crea una contraseña nueva. El enlace vence en ${validMinutes} minutos.`,
    title: 'Crea una contraseña nueva',
    paragraphs: [`Hola, ${name}. Recibimos una solicitud para restablecer la contraseña de tu cuenta.`],
    button: { label: 'Crear contraseña nueva', url: `${appWebUrl}/restablecer?token=${encodeURIComponent(token)}` },
    notes: [
      `El enlace vence en ${validMinutes} minutos y solo se puede usar una vez.`,
      'Si no lo pediste, ignora este correo. Tu contraseña actual sigue funcionando.',
    ],
    reason: 'Recibes este correo porque alguien pidió restablecer la contraseña de la cuenta registrada con esta dirección.',
  });
}

export interface InvitationEmailInput {
  to: string;
  name: string;
  companyName: string;
  /** Quién invita, tal como se llama en el sistema. */
  inviterName: string;
  /** Rol con el que entra, ya en texto (p. ej. "Administrador"). */
  roleLabel: string;
  token: string;
  appWebUrl: string;
  validDays: number;
}

/** El enlace abre la pantalla de la web donde la cuenta invitada define su contraseña. */
export function invitationEmail(input: InvitationEmailInput): EmailMessage {
  const { to, name, companyName, inviterName, roleLabel, token, appWebUrl, validDays } = input;
  return renderEmail({
    to,
    subject: `${inviterName} te invitó a ${companyName}`,
    preheader: `Activa tu cuenta con el rol de ${roleLabel}. El enlace vence en ${validDays} días.`,
    title: `Te invitaron a ${companyName}`,
    paragraphs: [
      `Hola, ${name}. ${inviterName} te invitó al espacio de trabajo de ${companyName} con el rol de ${roleLabel}.`,
      'Crea tu contraseña para activar la cuenta.',
    ],
    button: { label: 'Activar mi cuenta', url: `${appWebUrl}/activar?token=${encodeURIComponent(token)}` },
    notes: [`El enlace vence en ${validDays} días. Si vence, pide a ${inviterName} que te reenvíe la invitación.`],
    reason: `Recibes este correo porque ${inviterName} registró esta dirección en ${companyName}. Si no esperabas la invitación, ignóralo.`,
  });
}

export interface WelcomeEmailInput {
  to: string;
  name: string;
  appWebUrl: string;
}

/** Cuenta creada ya activa (alta directa). La contraseña no viaja en el correo: la define quien dio de alta la cuenta. */
export function welcomeEmail({ to, name, appWebUrl }: WelcomeEmailInput): EmailMessage {
  return renderEmail({
    to,
    subject: 'Tu cuenta de T-ssera está lista',
    preheader: 'Ya puedes iniciar sesión con este correo.',
    title: 'Tu cuenta está lista',
    paragraphs: [`Hola, ${name}. Tu cuenta quedó activa y ya puedes iniciar sesión con este correo (${to}).`],
    button: { label: 'Iniciar sesión', url: `${appWebUrl}/entrar` },
    notes: [
      'Este enlace no vence: lleva a la pantalla de inicio de sesión.',
      'Si no recuerdas tu contraseña, usa "¿Olvidaste tu contraseña?" en esa pantalla.',
    ],
    reason: 'Recibes este correo porque se creó una cuenta con esta dirección.',
  });
}
