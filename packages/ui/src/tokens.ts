// Sistema visual de T-Ssera. Sin dependencias: lo usan la app y cualquier otro cliente.

export const colors = {
  /** Acción primaria y progreso, con texto negro encima. */
  lime: '#B6FF5C',
  /** Texto principal. */
  ink: '#16150F',
  /** Texto secundario. */
  inkSecondary: '#6B6B65',
  /** Solo íconos y bordes. */
  stone: '#8C8C86',
  /** Tarjetas oscuras y elemento activo. */
  forest: '#1F3D2B',
  forestSoft: '#2E5339',
  /** Fondo. */
  bone: '#F7F7F2',
  /** Tarjetas e inputs. */
  white: '#FFFFFF',
  /** Bordes. */
  line: '#E4E4DE',
  /** Estados, siempre con texto negro encima. */
  success: '#3CB043',
  amber: '#C98A15',
  terracotta: '#B5651D',
  /** Solo eliminar y errores, con texto blanco. */
  danger: '#B3261E',
} as const;
export type ColorToken = keyof typeof colors;

/** Space Grotesk para títulos y cifras; Inter para textos e interfaz. */
export const fonts = {
  heading: 'Space Grotesk',
  body: 'Inter',
} as const;

/**
 * Familia por peso, con el nombre de su archivo en `packages/ui/assets/fonts`. Android elige la fuente por nombre
 * de archivo y la web declara estas mismas familias con @font-face, así un estilo sirve en las dos plataformas.
 */
export const fontFaces = {
  headingBold: 'SpaceGrotesk-Bold',
  headingSemiBold: 'SpaceGrotesk-SemiBold',
  body: 'Inter-Regular',
  bodySemiBold: 'Inter-SemiBold',
} as const;

export const radii = {
  card: 14,
  button: 12,
  input: 12,
  pill: 999,
} as const;

/** Área táctil mínima (ancho y alto) de cualquier control. */
export const touchTarget = 44;
