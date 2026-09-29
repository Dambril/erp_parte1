import {Platform} from 'react-native';

// El brief pide Space Grotesk (títulos) e Inter (cuerpo). Esta app bare RN no
// trae esas fuentes empaquetadas todavía: para agregarlas hay que copiar los
// .ttf a android/app/src/main/assets/fonts y volver a compilar. Mientras
// tanto se usa la fuente del sistema con el peso correspondiente, tal como
// indica el propio brief como fallback ("Inter bold" en vez de Space Grotesk).
export const fontFamily = {
  heading: Platform.select({android: 'sans-serif-medium', default: undefined}),
  body: Platform.select({android: 'sans-serif', default: undefined}),
};

export const typography = {
  h1: {fontFamily: fontFamily.heading, fontSize: 28, fontWeight: '700' as const},
  h2: {fontFamily: fontFamily.heading, fontSize: 20, fontWeight: '700' as const},
  h3: {fontFamily: fontFamily.heading, fontSize: 16, fontWeight: '600' as const},
  body: {fontFamily: fontFamily.body, fontSize: 14, fontWeight: '400' as const},
  bodySmall: {fontFamily: fontFamily.body, fontSize: 12, fontWeight: '400' as const},
  label: {fontFamily: fontFamily.body, fontSize: 11, fontWeight: '600' as const},
};
