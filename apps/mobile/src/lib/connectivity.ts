import NetInfo, {type NetInfoState} from '@react-native-community/netinfo';

/** Sin red o con red pero sin salida a internet. Mientras NetInfo no lo sabe (`null`), se asume que hay conexión. */
function isOnline(state: NetInfoState): boolean {
  return state.isConnected !== false && state.isInternetReachable !== false;
}

/** Avisa cada vez que cambia la conexión del dispositivo. Devuelve la función para dejar de escuchar. */
export function subscribeConnectivity(listener: (online: boolean) => void): () => void {
  return NetInfo.addEventListener((state) => listener(isOnline(state)));
}
