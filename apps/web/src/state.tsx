import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { mensajeError, type ObrasState } from '@erp/api-client';
import type { PublicUser } from '@erp/domain';
import { apiClient, obrasStore } from './lib/api';

interface AuthValue {
  user: PublicUser | null;
  cargandoSesion: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [cargandoSesion, setCargandoSesion] = useState(true);

  useEffect(() => {
    const unsubscribe = apiClient.onSessionChange((session) => setUser(session?.user ?? null));
    apiClient.restoreSession()
      .then((session) => setUser(session?.user ?? null))
      .finally(() => setCargandoSesion(false));
    return unsubscribe;
  }, []);

  // Carga las obras y abre el canal de tiempo real mientras haya sesión.
  useEffect(() => {
    if (!user) return;
    obrasStore.start();
    return () => obrasStore.stop();
  }, [user]);

  const value = useMemo<AuthValue>(() => ({
    user,
    cargandoSesion,
    login: async (email, password) => {
      try {
        await apiClient.login(email.trim(), password);
      } catch (error) {
        throw new Error(mensajeError(error));
      }
    },
    logout: () => apiClient.logout(),
  }), [user, cargandoSesion]);

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
