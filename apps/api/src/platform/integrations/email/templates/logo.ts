import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { InlineAttachment } from '../email-sender';

export const LOGO_CONTENT_ID = 'tssera-logo';
const LOGO_FILE = 'logo-lima.png';

// En desarrollo y pruebas el archivo está junto a este módulo; en el bundle de producción, `build.mjs` lo copia a dist/email-assets.
const CANDIDATES = [path.join(__dirname, 'assets', LOGO_FILE), path.join(__dirname, 'email-assets', LOGO_FILE)];

let cached: InlineAttachment | undefined;

/**
 * El logo viaja dentro del correo como imagen en línea (CID). Una URL no sirve: `localhost` no existe para quien
 * recibe el correo y muchos clientes bloquean las imágenes remotas.
 */
export function logoAttachment(): InlineAttachment {
  if (!cached) {
    const file = CANDIDATES.find((candidate) => existsSync(candidate));
    if (!file) throw new Error(`No se encontró ${LOGO_FILE} para los correos`);
    cached = { filename: LOGO_FILE, contentType: 'image/png', contentId: LOGO_CONTENT_ID, content: readFileSync(file).toString('base64') };
  }
  return cached;
}
