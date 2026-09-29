import {Platform} from 'react-native';
import {ApiClient} from '@erp/api-client';

// El emulador de Android ve el localhost del PC en 10.0.2.2. Al pasar a
// producción, cambiar por la URL pública de la API (ver docs/despliegue.md).
const baseUrl =
  Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000';

export const apiClient = new ApiClient({baseUrl});
