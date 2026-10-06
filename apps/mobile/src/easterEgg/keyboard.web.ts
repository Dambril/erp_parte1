export type GameKey = 'up' | 'down' | 'left' | 'right' | 'pause' | 'close';

const GAME_KEYS: Record<string, GameKey> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  w: 'up',
  s: 'down',
  a: 'left',
  d: 'right',
  ' ': 'pause',
  Enter: 'pause',
  Escape: 'close',
};

// ↑ ↑ ↓ ↓ ← → ← → B A
const SECRET_CODE = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];

const keyOf = (event: KeyboardEvent): string => (event.key.length === 1 ? event.key.toLowerCase() : event.key);

/** Teclas del juego mientras está abierto. */
export function subscribeGameKeys(listener: (key: GameKey) => void): () => void {
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const key = GAME_KEYS[keyOf(event)];
    if (!key) return;
    // En captura y sin propagar: las flechas no desplazan la página y Espacio no pulsa el botón con foco.
    event.preventDefault();
    event.stopPropagation();
    listener(key);
  };
  window.addEventListener('keydown', onKeyDown, true);
  return () => window.removeEventListener('keydown', onKeyDown, true);
}

/** Avisa cuando se teclea el código completo fuera de un campo de texto. */
export function subscribeSecretCode(listener: () => void): () => void {
  let progress = 0;
  const onKeyDown = (event: KeyboardEvent) => {
    const target = event.target;
    if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) {
      progress = 0;
      return;
    }
    const key = keyOf(event);
    if (key === SECRET_CODE[progress]) {
      progress += 1;
    } else if (key === 'ArrowUp') {
      // Una flecha arriba de más no rompe el comienzo del código.
      progress = progress === 2 ? 2 : 1;
    } else {
      progress = 0;
    }
    if (progress === SECRET_CODE.length) {
      progress = 0;
      listener();
    }
  };
  window.addEventListener('keydown', onKeyDown);
  return () => window.removeEventListener('keydown', onKeyDown);
}
