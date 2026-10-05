import type { EmailMessage } from '../email-sender';
import { LOGO_CONTENT_ID, logoAttachment } from './logo';

// Colores de docs/marca/identidad.md. Los correos no pueden importar los tokens de packages/ui (son para la app).
const COLOR = { forest: '#1F3D2B', lime: '#B6FF5C', ink: '#16150F', inkSecondary: '#6B6B65', bone: '#F7F7F2', white: '#FFFFFF', line: '#E4E4DE' };
const FONT = 'Arial, Helvetica, sans-serif';
const BRAND = 'T-ssera Construcciones';
const TAGLINE = 'Cada nivel, un paso más limpio.';

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export interface EmailContent {
  to: string;
  subject: string;
  /** Texto de vista previa que muestran las bandejas junto al asunto. */
  preheader: string;
  title: string;
  /** Una o dos frases, en texto plano: el layout las escapa. */
  paragraphs: string[];
  button: { label: string; url: string };
  /** Vigencia del enlace y avisos, bajo el botón. */
  notes: string[];
  /** Por qué llega este correo; va en el pie. */
  reason: string;
}

/**
 * Layout de todos los correos. Sigue las reglas del HTML para correo: tablas con estilos en línea, 600 px de ancho
 * máximo, sin CSS externo, sin JavaScript y sin SVG. Recibe solo texto plano y lo escapa aquí, de modo que una
 * plantilla no puede olvidarse de escapar un nombre escrito por un usuario.
 */
export function renderEmail(content: EmailContent): EmailMessage {
  const { to, subject, preheader, title, paragraphs, button, notes, reason } = content;
  const url = escapeHtml(button.url);
  const paragraph = (text: string, color: string, size: number) =>
    `<p style="margin:0 0 16px 0;font-family:${FONT};font-size:${size}px;line-height:1.5;color:${color};">${escapeHtml(text)}</p>`;

  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:${COLOR.bone};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${COLOR.bone};font-size:1px;line-height:1px;">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLOR.bone}" style="background-color:${COLOR.bone};">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">
<tr><td align="center" bgcolor="${COLOR.forest}" style="background-color:${COLOR.forest};padding:28px 24px;border-radius:14px 14px 0 0;">
<img src="cid:${LOGO_CONTENT_ID}" width="150" alt="${BRAND}" style="display:block;width:150px;height:auto;border:0;font-family:${FONT};font-size:18px;font-weight:bold;color:${COLOR.lime};">
</td></tr>
<tr><td bgcolor="${COLOR.white}" style="background-color:${COLOR.white};padding:32px 32px 24px 32px;border-left:1px solid ${COLOR.line};border-right:1px solid ${COLOR.line};">
<h1 style="margin:0 0 16px 0;font-family:${FONT};font-size:22px;line-height:1.3;font-weight:bold;color:${COLOR.ink};">${escapeHtml(title)}</h1>
${paragraphs.map((text) => paragraph(text, COLOR.ink, 16)).join('\n')}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px 0;">
<tr><td align="center" bgcolor="${COLOR.lime}" style="background-color:${COLOR.lime};border-radius:12px;">
<a href="${url}" target="_blank" style="display:inline-block;padding:14px 28px;font-family:${FONT};font-size:16px;font-weight:bold;color:${COLOR.ink};text-decoration:none;">${escapeHtml(button.label)}</a>
</td></tr>
</table>
${notes.map((text) => paragraph(text, COLOR.inkSecondary, 14)).join('\n')}
<p style="margin:0;font-family:${FONT};font-size:13px;line-height:1.5;color:${COLOR.inkSecondary};">Si el botón no funciona, copia este enlace en tu navegador:<br><a href="${url}" style="color:${COLOR.forest};word-break:break-all;">${url}</a></p>
</td></tr>
<tr><td bgcolor="${COLOR.white}" style="background-color:${COLOR.white};padding:20px 32px 28px 32px;border:1px solid ${COLOR.line};border-top:1px solid ${COLOR.line};border-radius:0 0 14px 14px;">
<p style="margin:0 0 6px 0;font-family:${FONT};font-size:13px;line-height:1.5;font-weight:bold;color:${COLOR.ink};">${BRAND} · ${TAGLINE}</p>
<p style="margin:0;font-family:${FONT};font-size:12px;line-height:1.5;color:${COLOR.inkSecondary};">${escapeHtml(reason)}</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  const text = [
    title,
    ...paragraphs,
    `${button.label}: ${button.url}`,
    ...notes,
    `${BRAND} · ${TAGLINE}`,
    reason,
  ].join('\n\n');

  return { to, subject, html, text, attachments: [logoAttachment()] };
}
