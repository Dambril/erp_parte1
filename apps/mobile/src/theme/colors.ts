import {colors as tokens} from '@erp/ui';

// Los valores salen de los tokens de `packages/ui`. Estos nombres en español son los que usan las
// pantallas de acceso (Bloque 1); las pantallas nuevas importan los tokens directamente.
export const colors = {
  lima: tokens.lime, // primario / CTA
  negro: tokens.ink, // texto principal
  verdeBosque: tokens.forest, // cards oscuras
  verdeBosqueClaro: tokens.forestSoft, // nav activa / acentos
  terracota: tokens.terracotta, // estado de alerta
  hueso: tokens.bone, // fondo
  piedra: tokens.stone, // íconos y bordes
  linea: tokens.line, // bordes
  exito: tokens.success, // estado completado
  ambar: tokens.amber, // estado en curso
  blanco: tokens.white, // cards
} as const;
