const KEY = 'tssera.sserpiente.record';

export function readBestScore(): number {
  try {
    const stored = Number(localStorage.getItem(KEY));
    return Number.isInteger(stored) && stored > 0 ? stored : 0;
  } catch {
    // Almacenamiento no disponible.
    return 0;
  }
}

export function saveBestScore(score: number): void {
  try {
    localStorage.setItem(KEY, String(score));
  } catch {
    // Almacenamiento no disponible: el récord no se conserva.
  }
}
