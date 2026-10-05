import type { EmailMessage } from '../platform/integrations/email';
import { invitationEmail, passwordResetEmail, welcomeEmail } from '../platform/integrations/email/templates';

/** Un ejemplo de cada correo del sistema, con datos ficticios, para la vista previa y el envío de prueba. */
export function sampleEmails(to: string, appWebUrl: string): { name: string; message: EmailMessage }[] {
  const token = 'token-de-ejemplo-no-valido';
  return [
    { name: 'restablecer', message: passwordResetEmail({ to, name: 'Ana Martínez', token, appWebUrl, validMinutes: 60 }) },
    {
      name: 'invitacion',
      message: invitationEmail({
        to, name: 'Ana Martínez', companyName: 'T-ssera Construcciones', inviterName: 'Luis Herrera', roleLabel: 'Administrador',
        token, appWebUrl, validDays: 7,
      }),
    },
    { name: 'bienvenida', message: welcomeEmail({ to, name: 'Ana Martínez', appWebUrl }) },
  ];
}
