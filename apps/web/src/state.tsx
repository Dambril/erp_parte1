import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { esErrorDeRed, mensajeError, permissionChecker, type ObrasState } from '@erp/api-client';
import type { Company, MeResponse, Permission, PublicUser } from '@erp/domain';
import { apiClient, obrasStore } from './lib/api';

/** `offline`: hay sesión guardada pero no se pudo validar por falta de red. */
export type SessionStatus = 'loading' | 'signedOut' | 'signedIn' | 'offline';

interface AuthValue {
  status: SessionStatus;
  user: PublicUser | null;
  company: Company | null;
  /** Permisos de `/me`: ambos roles ven el Dashboard; lo que muestra depende de esto. */
  can: (permission: Permission) => boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  retry: () => void;
  /** Aviso para la pantalla de login (p. ej. tras cambiar la contraseña). */
  aviso: string | null;
  setAviso: (aviso: string | null) => void;
}

const AuthContext = createContext<AuthValue | undefined>(undefined);
const NOTHING_ALLOWED = () => false;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [status, setStatus] = useState<SessionStatus>('loading');
  const [aviso, setAviso] = useState<string | null>(null);

  const restore = useCallback(() => {
    setStatus('loading');
    apiClient.restoreSession()
      .then((restored) => setStatus(restored ? 'signedIn' : 'signedOut'))
      .catch((error) => setStatus(esErrorDeRed(error) ? 'offline' : 'signedOut'));
  }, []);

  useEffect(() => {
    // Con null (refresh revocado, logout) se vuelve al login.
    const unsubscribe = apiClient.onSessionChange((next) => {
      setMe(next);
      setStatus(next ? 'signedIn' : 'signedOut');
    });
    restore();
    return unsubscribe;
  }, [restore]);

  // Carga las obras y abre el canal de tiempo real mientras haya sesión.
  useEffect(() => {
    if (status !== 'signedIn') return;
    obrasStore.start();
    return () => obrasStore.stop();
  }, [status]);

  const value = useMemo<AuthValue>(() => ({
    status,
    user: me?.user ?? null,
    company: me?.company ?? null,
    can: me ? permissionChecker(me.permissions) : NOTHING_ALLOWED,
    login: async (email, password) => {
      try {
        await apiClient.login(email.trim(), password);
        setAviso(null);
      } catch (error) {
        throw new Error(mensajeError(error));
      }
    },
    logout: () => apiClient.logout(),
    retry: restore,
    aviso,
    setAviso,
  }), [me, status, restore, aviso]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}

export function useObras(): ObrasState & { store: typeof obrasStore } {
  const state = useSyncExternalStore(obrasStore.subscribe, obrasStore.getSnapshot);
  return { ...state, store: obrasStore };
}

/** Enrutado por hash (#/obras/123): funciona en Cloudflare Pages sin reglas de reescritura. */
export function useRuta(): string {
  const [ruta, setRuta] = useState(() => window.location.hash.slice(1) || '/');
  useEffect(() => {
    const onChange = () => setRuta(window.location.hash.slice(1) || '/');
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return ruta;
}

export function navegar(ruta: string): void {
  window.location.hash = ruta;
}
