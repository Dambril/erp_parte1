import React, {createContext, useContext, useEffect, useMemo, useState} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {loginConCredenciales, type DemoUser} from '../data/auth';

const SESSION_KEY = '@tssera/session';

interface AuthContextValue {
  user: DemoUser | null;
  isLoadingSession: boolean; // true mientras se revisa si ya había sesión guardada
  isLoggingIn: boolean; // true mientras se procesa el login
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({children}: {children: React.ReactNode}): React.ReactElement {
  const [user, setUser] = useState<DemoUser | null>(null);
  const [isLoadingSession, setIsLoadingSession] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(SESSION_KEY)
      .then((raw) => {
        if (raw) setUser(JSON.parse(raw));
      })
      .catch(() => {
        // Sesión no recuperable: se sigue como si no hubiera sesión.
      })
      .finally(() => setIsLoadingSession(false));
  }, []);

  const login = async (email: string, password: string) => {
    setIsLoggingIn(true);
    setError(null);
    try {
      const demoUser = await loginConCredenciales(email, password);
      await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(demoUser));
      setUser(demoUser);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo iniciar sesión.');
      throw err;
    } finally {
      setIsLoggingIn(false);
    }
  };

  const logout = async () => {
    await AsyncStorage.removeItem(SESSION_KEY);
    setUser(null);
  };

  const value = useMemo<AuthContextValue>(
    () => ({user, isLoadingSession, isLoggingIn, error, login, logout}),
    [user, isLoadingSession, isLoggingIn, error],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}
