import React, {createContext, useCallback, useContext, useEffect, useMemo, useState} from 'react';
import {esErrorDeRed, mensajeError, permissionChecker} from '@erp/api-client';
import type {Company, MeResponse, Permission, PublicUser} from '@erp/domain';
import {apiClient} from '../lib/apiClient';

/** `offline`: hay sesión guardada pero no se pudo validar por falta de red. */
export type SessionStatus = 'loading' | 'signedOut' | 'signedIn' | 'offline';

interface AuthContextValue {
  status: SessionStatus;
  user: PublicUser | null;
  company: Company | null;
  /** Permisos de `/me`: ambos roles ven el Dashboard; lo que muestra depende de esto. */
  can: (permission: Permission) => boolean;
  isLoggingIn: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Reintenta recuperar la sesión guardada (tras quedarse `offline`). */
  retry: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
const NOTHING_ALLOWED = () => false;

export function AuthProvider({children}: {children: React.ReactNode}): React.ReactElement {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [status, setStatus] = useState<SessionStatus>('loading');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const restore = useCallback(() => {
    setStatus('loading');
    apiClient
      .restoreSession()
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

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user: me?.user ?? null,
      company: me?.company ?? null,
      can: me ? permissionChecker(me.permissions) : NOTHING_ALLOWED,
      isLoggingIn,
      login: async (email, password) => {
        setIsLoggingIn(true);
        try {
          await apiClient.login(email.trim(), password);
        } catch (err) {
          throw new Error(mensajeError(err));
        } finally {
          setIsLoggingIn(false);
        }
      },
      logout: () => apiClient.logout(),
      retry: restore,
    }),
    [me, status, isLoggingIn, restore],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}
