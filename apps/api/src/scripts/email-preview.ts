/**
 * Escribe el HTML y el texto de cada correo en apps/api/.email-preview (ignorada por git) para abrirlos en el navegador.
 *
 *   pnpm --filter @erp/api email:preview
 *
 * No envía nada ni necesita variables de entorno. En el correo real el logo viaja como adjunto en línea (CID);
 * un navegador no entiende `cid:`, así que aquí se sustituye por la misma imagen embebida como data URI.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { sampleEmails } from './email-samples';

const outDir = path.resolve(__dirname, '../../.email-preview');
mkdirSync(outDir, { recursive: true });

for (const { name, message } of sampleEmails('destinatario@example.com', 'http://localhost:5173')) {
  let html = message.html;
  for (const attachment of message.attachments ?? []) {
    html = html.replace(`cid:${attachment.contentId}`, `data:${attachment.contentType};base64,${attachment.content}`);
  }
  writeFileSync(path.join(outDir, `${name}.html`), html);
  writeFileSync(path.join(outDir, `${name}.txt`), `Asunto: ${message.subject}\n\n${message.text}\n`);
  console.log(`${name}: "${message.subject}" → ${path.join(outDir, `${name}.html`)}`);
}
