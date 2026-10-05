// Metro entrega un identificador de recurso y Vite una URL; `Image` acepta ambos como `source`.
declare module '*.png' {
  import type {ImageSourcePropType} from 'react-native';
  const source: ImageSourcePropType;
  export default source;
}
