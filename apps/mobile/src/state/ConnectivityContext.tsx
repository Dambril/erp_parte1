import React, {createContext, useContext, useEffect, useState} from 'react';
import {subscribeConnectivity} from '../lib/connectivity';

const ConnectivityContext = createContext<boolean>(true);

/** Estado de la conexión del dispositivo. No hay caché sin conexión: solo se avisa y se reintenta al volver. */
export function ConnectivityProvider({children}: {children: React.ReactNode}): React.ReactElement {
  const [online, setOnline] = useState(true);
  useEffect(() => subscribeConnectivity(setOnline), []);
  return <ConnectivityContext.Provider value={online}>{children}</ConnectivityContext.Provider>;
}

export function useConnectivity(): boolean {
  return useContext(ConnectivityContext);
}
