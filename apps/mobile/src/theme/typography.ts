import {fontFaces} from '@erp/ui';

// Space Grotesk para títulos y cifras; Inter para textos. Cada peso es una familia propia (`fontFaces`):
// Android toma el archivo de `assets/fonts` por su nombre y la web declara esas mismas familias con @font-face.
export const fontFamily = {
  heading: fontFaces.headingBold,
  body: fontFaces.body,
};

export const typography = {
  // Sin `fontWeight`: el peso ya está en el archivo. Con 700, Android buscaría `SpaceGrotesk-Bold_bold.ttf`
  // y, al no encontrarlo, caería en la fuente del sistema.
  h1: {fontFamily: fontFaces.headingBold, fontSize: 28},
  h2: {fontFamily: fontFaces.headingBold, fontSize: 20},
  h3: {fontFamily: fontFaces.headingSemiBold, fontSize: 16, fontWeight: '600' as const},
  body: {fontFamily: fontFaces.body, fontSize: 14, fontWeight: '400' as const},
  bodySmall: {fontFamily: fontFaces.body, fontSize: 12, fontWeight: '400' as const},
  label: {fontFamily: fontFaces.bodySemiBold, fontSize: 11, fontWeight: '600' as const},
};
