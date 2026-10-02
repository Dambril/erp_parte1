import React, {createContext, useCallback, useContext, useEffect, useMemo, useState} from 'react';
import {connectRealtime, type RealtimeStatus} from '@erp/api-client';
import {apiClient} from '../lib/apiClient';
import {useAuth} from './AuthContext';

interface ConstructionContextValue {
  /** Cambia cada vez que hay que volver a consultar: un aviso del canal, una reconexión o un cambio propio. */
  version: number;
  conexion: RealtimeStatus;
  /** Tras guardar algo, para que todas las pantallas abiertas se pongan al día. */
  refresh: () => void;
}

const ConstructionContext = createContext<ConstructionContextValue | undefined>(undefined);

/**
 * Mantiene abierto el canal de tiempo real mientras hay sesión. Los avisos no traen datos (ni montos):
 * solo indican que algo cambió y las pantallas vuelven a pedirlo a la API con los permisos del usuario.
 */
export function ConstructionProvider({children}: {children: React.ReactNode}): React.ReactElement {
  const {status} = useAuth();
  const [version, setVersion] = useState(0);
  const [conexion, setConexion] = useState<RealtimeStatus>('desconectado');
  const refresh = useCallback(() => setVersion((current) => current + 1), []);

  useEffect(() => {
    if (status !== 'signedIn') return;
    let primeraConexion = true;
    const realtime = connectRealtime(apiClient, {
      onEvent: refresh,
      onStatus: setConexion,
      onReady: () => {
        // La primera conexión coincide con la carga inicial; las siguientes recuperan lo perdido.
        if (!primeraConexion) refresh();
        primeraConexion = false;
      },
    });
    return () => realtime.close();
  }, [status, refresh]);

  const value = useMemo(() => ({version, conexion, refresh}), [version, conexion, refresh]);
  return <ConstructionContext.Provider value={value}>{children}</ConstructionContext.Provider>;
}

export function useConstruction(): ConstructionContextValue {
  const ctx = useContext(ConstructionContext);
  if (!ctx) throw new Error('useConstruction debe usarse dentro de <ConstructionProvider>');
  return ctx;
}
