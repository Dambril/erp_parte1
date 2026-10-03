import React, {createContext, useContext, useEffect, useState} from 'react';
import NetInfo, {type NetInfoState} from '@react-native-community/netinfo';

const ConnectivityContext = createContext<boolean>(true);

/** Sin red o con red pero sin salida a internet. Mientras NetInfo no lo sabe (`null`), se asume que hay conexión. */
function isOnline(state: NetInfoState): boolean {
  return state.isConnected !== false && state.isInternetReachable !== false;
}

/** Estado de la conexión del dispositivo. No hay caché sin conexión: solo se avisa y se reintenta al volver. */
export function ConnectivityProvider({children}: {children: React.ReactNode}): React.ReactElement {
  const [online, setOnline] = useState(true);
  useEffect(() => NetInfo.addEventListener((state) => setOnline(isOnline(state))), []);
  return <ConnectivityContext.Provider value={online}>{children}</ConnectivityContext.Provider>;
}

export function useConnectivity(): boolean {
  return useContext(ConnectivityContext);
}
