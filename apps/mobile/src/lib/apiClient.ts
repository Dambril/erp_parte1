import {Platform} from 'react-native';
import * as Keychain from 'react-native-keychain';
import {ApiClient, type SessionStore, type StoredSession} from '@erp/api-client';

// Builds de desarrollo (__DEV__): API local; el emulador de Android ve el localhost del PC en 10.0.2.2.
// Builds release: la API desplegada en Render.
const PRODUCTION_API_URL = 'https://erp-api-305o.onrender.com';
const DEVELOPMENT_API_URL =
  Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000';
const baseUrl = __DEV__ ? DEVELOPMENT_API_URL : PRODUCTION_API_URL;

// Los tokens van cifrados en el Keystore de Android / Keychain de iOS, no en AsyncStorage (texto plano).
const KEYCHAIN_SERVICE = 'com.tssera.construcciones.session';

const keychainSessionStore: SessionStore = {
  async load() {
    const entry = await Keychain.getGenericPassword({service: KEYCHAIN_SERVICE});
    if (!entry) return null;
    const stored = JSON.parse(entry.password) as Partial<StoredSession>;
    return typeof stored.refreshToken === 'string'
      ? {refreshToken: stored.refreshToken, accessToken: stored.accessToken}
      : null;
  },
  async save({accessToken, refreshToken}) {
    await Keychain.setGenericPassword('session', JSON.stringify({accessToken, refreshToken}), {
      service: KEYCHAIN_SERVICE,
      accessible: Keychain.ACCESSIBLE.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    });
  },
  async clear() {
    await Keychain.resetGenericPassword({service: KEYCHAIN_SERVICE});
  },
};

export const apiClient = new ApiClient({baseUrl, sessionStore: keychainSessionStore});
