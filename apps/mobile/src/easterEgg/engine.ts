// Reglas de T-sserpiente, sin React ni temporizadores: cada función recibe una partida y devuelve la siguiente.

/** Casillas por lado del tablero. */
export const GRID = 18;

const BONUS_EVERY = 5;
const BONUS_POINTS = 5;
/** Ticks que la tesela dorada permanece en el tablero. */
const BONUS_TICKS = 45;

export type Direction = 'up' | 'down' | 'left' | 'right';
export type Phase = 'ready' | 'playing' | 'paused' | 'over';
export type Ending = 'wall' | 'self' | 'complete';

export interface Cell {
  x: number;
  y: number;
}

export interface Bonus {
  cell: Cell;
  ticksLeft: number;
}

export interface Game {
  /** La cabeza va primero. */
  snake: Cell[];
  direction: Direction;
  /** Giros pendientes: dos pulsaciones rápidas entre un tick y otro se aplican en orden, una por tick. */
  queue: Direction[];
  food: Cell;
  bonus: Bonus | null;
  score: number;
  /** Teselas normales comidas: marcan el nivel. */
  eaten: number;
  phase: Phase;
  ending: Ending | null;
}

const DELTA: Record<Direction, Cell> = {
  up: {x: 0, y: -1},
  down: {x: 0, y: 1},
  left: {x: -1, y: 0},
  right: {x: 1, y: 0},
};

const OPPOSITE: Record<Direction, Direction> = {up: 'down', down: 'up', left: 'right', right: 'left'};

export const sameCell = (a: Cell, b: Cell): boolean => a.x === b.x && a.y === b.y;

function freeCell(taken: Cell[]): Cell | null {
  const free: Cell[] = [];
  for (let y = 0; y < GRID; y += 1) {
    for (let x = 0; x < GRID; x += 1) {
      if (!taken.some((cell) => cell.x === x && cell.y === y)) free.push({x, y});
    }
  }
  return free[Math.floor(Math.random() * free.length)] ?? null;
}

export function newGame(phase: Phase = 'ready'): Game {
  const mid = Math.floor(GRID / 2);
  const snake = [
    {x: mid, y: mid},
    {x: mid - 1, y: mid},
    {x: mid - 2, y: mid},
  ];
  return {
    snake,
    direction: 'right',
    queue: [],
    food: freeCell(snake) ?? {x: 0, y: 0},
    bonus: null,
    score: 0,
    eaten: 0,
    phase,
    ending: null,
  };
}

export const level = (game: Game): number => Math.floor(game.eaten / BONUS_EVERY) + 1;

/** Cada nivel acorta el tick 10 ms, hasta un mínimo de 70. */
export const tickMs = (game: Game): number => Math.max(70, 150 - (level(game) - 1) * 10);

/** Empieza, pausa o reanuda; al terminar, arranca una partida nueva. */
export function togglePause(game: Game): Game {
  if (game.phase === 'over') return newGame('playing');
  return {...game, phase: game.phase === 'playing' ? 'paused' : 'playing'};
}

/** Encola un giro. Con la partida lista, además la empieza. */
export function turn(game: Game, direction: Direction): Game {
  if (game.phase === 'paused' || game.phase === 'over') return game;
  const started: Game = game.phase === 'ready' ? {...game, phase: 'playing'} : game;
  const last = started.queue[started.queue.length - 1] ?? started.direction;
  // Girar 180° sería chocar con el propio cuello.
  if (direction === last || direction === OPPOSITE[last] || started.queue.length >= 2) return started;
  return {...started, queue: [...started.queue, direction]};
}

/** Avanza una casilla. */
export function step(game: Game): Game {
  if (game.phase !== 'playing') return game;

  const [next, ...queue] = game.queue;
  const direction = next ?? game.direction;
  const head = game.snake[0]!;
  const moved = {x: head.x + DELTA[direction].x, y: head.y + DELTA[direction].y};
  const end = (ending: Ending): Game => ({...game, direction, queue, phase: 'over', ending});

  if (moved.x < 0 || moved.y < 0 || moved.x >= GRID || moved.y >= GRID) return end('wall');

  const ateFood = sameCell(moved, game.food);
  const ateBonus = game.bonus !== null && sameCell(moved, game.bonus.cell);
  // La cola avanza en este mismo tick: su casilla queda libre salvo que la serpiente crezca.
  const body = ateFood || ateBonus ? game.snake : game.snake.slice(0, -1);
  if (body.some((cell) => sameCell(cell, moved))) return end('self');

  const snake = [moved, ...body];
  let {food, bonus, score, eaten} = game;

  if (bonus) bonus = ateBonus || bonus.ticksLeft <= 1 ? null : {...bonus, ticksLeft: bonus.ticksLeft - 1};
  if (ateBonus) score += BONUS_POINTS;

  if (ateFood) {
    score += 1;
    eaten += 1;
    const spot = freeCell(bonus ? [...snake, bonus.cell] : snake);
    // Sin casillas libres: el mosaico está completo.
    if (!spot) return {...game, snake, direction, queue, bonus, score, eaten, phase: 'over', ending: 'complete'};
    food = spot;
    if (!bonus && eaten % BONUS_EVERY === 0) {
      const cell = freeCell([...snake, food]);
      if (cell) bonus = {cell, ticksLeft: BONUS_TICKS};
    }
  }

  return {...game, snake, direction, queue, food, bonus, score, eaten};
}
