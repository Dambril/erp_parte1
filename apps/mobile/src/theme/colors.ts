// Paleta del diseño de Figma "T-Ssera Construcciones" (ver docs/brief pegado en la conversación).
export const colors = {
  lima: '#B6FF5C', // primario / CTA
  negro: '#16150F', // texto principal
  verdeBosque: '#1F3D2B', // cards oscuras
  verdeBosqueClaro: '#2E5339', // nav activa / acentos
  terracota: '#B5651D', // estado "retrasada"
  hueso: '#F7F7F2', // fondo
  piedra: '#8C8C86', // texto secundario
  linea: '#E4E4DE', // bordes
  exito: '#3CB043', // estado "completada"
  ambar: '#C98A15', // estado "en progreso"
  blanco: '#FFFFFF', // cards
} as const;

export type ObraEstado = 'en_progreso' | 'certificando' | 'retrasada' | 'completada';

// El brief no especifica un color propio para "certificando"; se usa el verde bosque
// claro para diferenciarlo de "en progreso" (ámbar) sin salir de la paleta dada.
export const estadoColor: Record<ObraEstado, string> = {
  en_progreso: colors.ambar,
  certificando: colors.verdeBosqueClaro,
  retrasada: colors.terracota,
  completada: colors.exito,
};

export const estadoLabel: Record<ObraEstado, string> = {
  en_progreso: 'En progreso',
  certificando: 'Certificando',
  retrasada: 'Retrasada',
  completada: 'Completada',
};
