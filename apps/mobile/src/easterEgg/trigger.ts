import {useMemo, useRef} from 'react';

// El juego no tiene ruta ni entrada en la navegación: se abre con este aviso, desde los gestos de abajo
// o desde el código de teclado de `keyboard.web.ts`.
const listeners = new Set<() => void>();

export function openEasterEgg(): void {
  listeners.forEach((listener) => listener());
}

export function subscribeEasterEgg(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const TAPS = 7;
/** Pausa máxima entre un toque y el siguiente. */
const TAP_GAP_MS = 500;

/**
 * Props para un `View`: siete toques seguidos abren el juego. Usa el sistema de responder y no un `Pressable`
 * para que el elemento no cambie el cursor ni reciba foco en la web.
 */
export function useSecretTaps(): {onStartShouldSetResponder: () => boolean; onResponderRelease: () => void} {
  const taps = useRef({count: 0, last: 0});
  return useMemo(
    () => ({
      onStartShouldSetResponder: () => true,
      onResponderRelease: () => {
        const now = Date.now();
        const count = now - taps.current.last <= TAP_GAP_MS ? taps.current.count + 1 : 1;
        taps.current = {count: count >= TAPS ? 0 : count, last: now};
        if (count >= TAPS) openEasterEgg();
      },
    }),
    [],
  );
}
