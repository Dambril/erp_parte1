import {Platform} from 'react-native';

// `babel.config.js` sustituye esta expresión por el valor de la variable de entorno TSSERA_API_URL al
// generar el bundle. Un APK release no compila sin ella (lo comprueba android/app/build.gradle).
const BUILD_API_URL = process.env.TSSERA_API_URL;

// Solo en desarrollo, si no se definió la variable: el emulador de Android ve el localhost del PC en 10.0.2.2.
const DEVELOPMENT_API_URL = Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000';

export const API_URL = BUILD_API_URL || (__DEV__ ? DEVELOPMENT_API_URL : '');
