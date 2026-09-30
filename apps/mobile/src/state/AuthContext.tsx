import React, {createContext, useContext, useEffect, useMemo, useState} from 'react';
import {mensajeError} from '@erp/api-client';
import type {PublicUser} from '@erp/domain';
import {apiClient} from '../lib/apiClient';

interface AuthContextValue {
  user: PublicUser | null;
  isLoadingSession: boolean; // true mientras se revisa si ya había sesión guardada
  isLoggingIn: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({children}: {children: React.ReactNode}): React.ReactElement {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [isLoadingSession, setIsLoadingSession] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  useEffect(() => {
    // Si el refresh token caduca o se revoca, el cliente avisa con null y se vuelve al login.
    const unsubscribe = apiClient.onSessionChange((session) => setUser(session?.user ?? null));
    apiClient
      .restoreSession()
      .then((session) => setUser(session?.user ?? null))
      .finally(() => setIsLoadingSession(false));
    return unsubscribe;
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoadingSession,
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
    }),
    [user, isLoadingSession, isLoggingIn],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}
