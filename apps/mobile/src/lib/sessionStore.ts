import * as Keychain from 'react-native-keychain';
import type {SessionStore, StoredSession} from '@erp/api-client';

// Los tokens van cifrados en el Keystore de Android / Keychain de iOS, no en AsyncStorage (texto plano).
const KEYCHAIN_SERVICE = 'com.tssera.construcciones.session';

/** En nativo el refresh token viaja en el cuerpo de las peticiones y se guarda cifrado. */
export const cookieSession = false;

export const sessionStore: SessionStore = {
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
