// En la app nativa el récord dura lo que dure abierta; la web lo guarda en el navegador (ver `bestScore.web.ts`).
let best = 0;

export function readBestScore(): number {
  return best;
}

export function saveBestScore(score: number): void {
  best = score;
}
