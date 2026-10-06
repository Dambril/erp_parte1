export type GameKey = 'up' | 'down' | 'left' | 'right' | 'pause' | 'close';

// La app nativa no tiene teclado: se juega deslizando (ver `keyboard.web.ts`).
export function subscribeGameKeys(_listener: (key: GameKey) => void): () => void {
  return () => {};
}

export function subscribeSecretCode(_listener: () => void): () => void {
  return () => {};
}
