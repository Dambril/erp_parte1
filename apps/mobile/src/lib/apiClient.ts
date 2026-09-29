import {Platform} from 'react-native';
import {ApiClient} from '@erp/api-client';

// Builds de desarrollo (__DEV__): API local; el emulador de Android ve el localhost del PC en 10.0.2.2.
// Builds release: la API desplegada en Render.
const PRODUCTION_API_URL = 'https://erp-api-305o.onrender.com';
const DEVELOPMENT_API_URL =
  Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000';
const baseUrl = __DEV__ ? DEVELOPMENT_API_URL : PRODUCTION_API_URL;

export const apiClient = new ApiClient({baseUrl});
