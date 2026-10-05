/** Misma interfaz que la versión nativa, con los eventos `online` y `offline` del navegador. */
export function subscribeConnectivity(listener: (online: boolean) => void): () => void {
  const update = () => listener(navigator.onLine);
  window.addEventListener('online', update);
  window.addEventListener('offline', update);
  update();
  return () => {
    window.removeEventListener('online', update);
    window.removeEventListener('offline', update);
  };
}
