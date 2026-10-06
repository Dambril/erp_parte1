import React, {useEffect, useRef, useState} from 'react';
import {Animated, Modal, PanResponder, Platform, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View} from 'react-native';
import {colors, radii, touchTarget} from '@erp/ui';
import {typography} from '../theme/typography';
import {readBestScore, saveBestScore} from './bestScore';
import {GRID, level, newGame, step, tickMs, togglePause, turn, type Cell, type Direction, type Ending, type Game} from './engine';
import {subscribeGameKeys, subscribeSecretCode} from './keyboard';
import {openEasterEgg, subscribeEasterEgg} from './trigger';

const MAX_BOARD = 468;
/** Lo que no es tablero: encabezado, marcador y ayuda. */
const CHROME_HEIGHT = 250;
/** Recorrido del dedo que cuenta como un giro. */
const SWIPE_PX = 18;

const ENDING_TITLE: Record<Ending, string> = {
  wall: 'Chocaste con el muro',
  self: 'Te enredaste en tu propia obra',
  complete: 'Mosaico completo',
};

const HINT =
  Platform.OS === 'web'
    ? 'Flechas o WASD para mover · Espacio pausa · Esc sale'
    : 'Desliza para mover · toca para pausar';
const RESUME = Platform.OS === 'web' ? 'Espacio o un toque' : 'Un toque';

/**
 * T-sserpiente: el juego escondido. Va montado en la raíz de la app, fuera de la navegación, así que no tiene
 * ruta ni título propio. Cómo se abre: `trigger.ts` y `keyboard.web.ts`.
 */
export function SnakeGame(): React.ReactElement | null {
  const [visible, setVisible] = useState(false);

  useEffect(() => subscribeEasterEgg(() => setVisible(true)), []);
  useEffect(() => (visible ? undefined : subscribeSecretCode(openEasterEgg)), [visible]);

  if (!visible) return null;
  const close = () => setVisible(false);
  return (
    <Modal visible animationType="fade" onRequestClose={close} statusBarTranslucent>
      <Play onClose={close} />
    </Modal>
  );
}

function Play({onClose}: {onClose: () => void}): React.ReactElement {
  const {width, height} = useWindowDimensions();
  const [game, setGame] = useState<Game>(() => newGame());
  const [best, setBest] = useState(readBestScore);

  const playing = game.phase === 'playing';
  const speed = tickMs(game);
  const isRecord = game.phase === 'over' && game.score > best;

  useEffect(() => {
    if (!playing) return undefined;
    const timer = setInterval(() => setGame(step), speed);
    return () => clearInterval(timer);
  }, [playing, speed]);

  useEffect(() => {
    if (isRecord) saveBestScore(game.score);
  }, [isRecord, game.score]);

  const toggle = () => {
    // El récord en pantalla se actualiza al empezar la siguiente partida: mientras tanto se anuncia como nuevo.
    if (isRecord) setBest(game.score);
    setGame(togglePause);
  };

  // Los escuchas de teclado y de gestos se crean una vez y leen aquí las funciones vigentes.
  const actions = useRef({toggle, onClose});
  actions.current = {toggle, onClose};

  useEffect(
    () =>
      subscribeGameKeys((key) => {
        if (key === 'close') actions.current.onClose();
        else if (key === 'pause') actions.current.toggle();
        else setGame((current) => turn(current, key));
      }),
    [],
  );

  const swipe = useRef({x: 0, y: 0, turned: false});
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        swipe.current = {x: 0, y: 0, turned: false};
      },
      // Gira en cuanto el dedo recorre lo suficiente, sin esperar a que se levante, y vuelve a medir desde ahí:
      // un mismo gesto puede encadenar varios giros.
      onPanResponderMove: (_event, gesture) => {
        const dx = gesture.dx - swipe.current.x;
        const dy = gesture.dy - swipe.current.y;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_PX) return;
        swipe.current = {x: gesture.dx, y: gesture.dy, turned: true};
        const direction: Direction = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
        setGame((current) => turn(current, direction));
      },
      onPanResponderRelease: () => {
        if (!swipe.current.turned) actions.current.toggle();
      },
    }),
  ).current;

  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const useNativeDriver = Platform.OS !== 'web';
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {toValue: 1, duration: 550, useNativeDriver}),
        Animated.timing(pulse, {toValue: 0, duration: 550, useNativeDriver}),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const cell = Math.max(10, Math.floor(Math.min(width - 32, height - CHROME_HEIGHT, MAX_BOARD) / GRID));
  const board = cell * GRID;
  const place = (at: Cell) => ({left: at.x * cell, top: at.y * cell, width: cell, height: cell});
  const tileScale = pulse.interpolate({inputRange: [0, 1], outputRange: [0.5, 0.66]});
  // La tesela dorada parpadea cuando está por desaparecer.
  const bonusVisible = game.bonus !== null && (game.bonus.ticksLeft > 12 || game.bonus.ticksLeft % 2 === 0);

  return (
    <View style={[styles.screen, webNoScroll]} {...pan.panHandlers}>
      <View style={[styles.header, {width: board}]}>
        <View style={styles.flex}>
          <Text style={[typography.h1, styles.brand]}>T-sserpiente</Text>
          <Text style={[typography.bodySmall, styles.muted]}>Coloca teselas. No choques con la obra.</Text>
        </View>
        <TouchableOpacity style={styles.close} onPress={onClose} accessibilityRole="button" accessibilityLabel="Cerrar" activeOpacity={0.7}>
          <Text style={styles.closeText}>×</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.stats, {width: board}]}>
        <Stat label="Teselas" value={game.score} />
        <Stat label="Nivel" value={level(game)} />
        <Stat label="Récord" value={Math.max(best, game.score)} highlight={isRecord} />
      </View>

      <View style={[styles.board, {width: board, height: board}]}>
        <Floor cell={cell} />

        <Animated.View style={[styles.item, place(game.food), {transform: [{rotate: '45deg'}, {scale: tileScale}]}]}>
          <View style={styles.food} />
        </Animated.View>
        {game.bonus && bonusVisible ? (
          <Animated.View style={[styles.item, place(game.bonus.cell), {transform: [{rotate: '45deg'}, {scale: tileScale}]}]}>
            <View style={styles.bonus} />
          </Animated.View>
        ) : null}

        {game.snake.map((segment, index) => (
          <View key={index} style={[styles.item, place(segment)]}>
            <View
              style={[
                styles.segment,
                {borderRadius: cell * (index === 0 ? 0.38 : 0.28), opacity: 1 - 0.5 * (index / game.snake.length)},
              ]}>
              {index === 0 ? <Eyes cell={cell} direction={game.direction} /> : null}
            </View>
          </View>
        ))}

        {playing ? null : (
          <View style={styles.veil}>
            <Text style={[typography.h2, styles.veilTitle]}>{veilTitle(game)}</Text>
            {game.phase === 'over' ? (
              <Text style={[typography.body, isRecord ? styles.record : styles.veilText]}>
                {game.score === 1 ? '1 tesela colocada' : `${game.score} teselas colocadas`}
                {isRecord ? ' · nuevo récord' : ''}
              </Text>
            ) : null}
            <Text style={[typography.body, styles.veilText]}>{veilAction(game)}</Text>
          </View>
        )}
      </View>

      <Text style={[typography.bodySmall, styles.muted, styles.hint, {width: board}]}>{HINT}</Text>
    </View>
  );
}

function veilTitle(game: Game): string {
  if (game.phase === 'over' && game.ending) return ENDING_TITLE[game.ending];
  return game.phase === 'paused' ? 'En pausa' : 'Turno extra';
}

function veilAction(game: Game): string {
  if (game.phase === 'over') return `${RESUME} para otra ronda`;
  return game.phase === 'paused' ? `${RESUME} para seguir` : `${RESUME} para empezar`;
}

function Stat({label, value, highlight}: {label: string; value: number; highlight?: boolean}): React.ReactElement {
  return (
    <View style={styles.stat}>
      <Text style={[typography.label, styles.statLabel]}>{label}</Text>
      <Text style={[typography.h2, highlight ? styles.record : styles.statValue]}>{value}</Text>
    </View>
  );
}

/** Piso en damero. No cambia durante la partida: solo se vuelve a pintar si cambia el tamaño de la casilla. */
const Floor = React.memo(function Floor({cell}: {cell: number}): React.ReactElement {
  const tiles: React.ReactElement[] = [];
  for (let y = 0; y < GRID; y += 1) {
    for (let x = y % 2; x < GRID; x += 2) {
      tiles.push(<View key={`${x}-${y}`} style={[styles.floorTile, {left: x * cell, top: y * cell, width: cell, height: cell}]} />);
    }
  }
  return <>{tiles}</>;
});

/** Dos ojos en el borde de la cabeza que mira hacia donde avanza. */
function Eyes({cell, direction}: {cell: number; direction: Direction}): React.ReactElement {
  const inner = cell - 2;
  const size = Math.max(2, Math.round(inner * 0.18));
  const front = direction === 'right' || direction === 'down' ? inner * 0.62 : inner * 0.2;
  const sides = [inner * 0.2, inner * 0.8 - size];
  return (
    <>
      {sides.map((side) => (
        <View
          key={side}
          style={[
            styles.eye,
            {width: size, height: size},
            direction === 'left' || direction === 'right' ? {left: front, top: side} : {left: side, top: front},
          ]}
        />
      ))}
    </>
  );
}

// En pantallas táctiles de la web, deslizar hacia abajo recargaría la página.
const webNoScroll = Platform.OS === 'web' ? ({touchAction: 'none', userSelect: 'none'} as object) : null;

const styles = StyleSheet.create({
  screen: {flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16, gap: 14, backgroundColor: colors.ink},
  flex: {flex: 1},
  header: {flexDirection: 'row', alignItems: 'center', gap: 12},
  brand: {color: colors.lime},
  muted: {color: colors.stone},
  close: {
    width: touchTarget,
    height: touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.forestSoft,
  },
  closeText: {fontSize: 24, lineHeight: 26, color: colors.bone},
  stats: {flexDirection: 'row', gap: 10},
  stat: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    gap: 2,
    borderRadius: radii.card,
    backgroundColor: colors.forest,
  },
  statLabel: {color: colors.stone, textTransform: 'uppercase', letterSpacing: 0.4},
  statValue: {color: colors.bone},
  record: {color: colors.lime},
  board: {
    overflow: 'hidden',
    borderRadius: radii.card,
    backgroundColor: colors.forest,
  },
  floorTile: {position: 'absolute', backgroundColor: colors.forestSoft, opacity: 0.35},
  item: {position: 'absolute', padding: 1},
  segment: {flex: 1, backgroundColor: colors.lime},
  eye: {position: 'absolute', borderRadius: radii.pill, backgroundColor: colors.ink},
  food: {flex: 1, borderRadius: 3, backgroundColor: colors.bone},
  bonus: {flex: 1, borderRadius: 3, backgroundColor: colors.amber},
  veil: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    gap: 6,
    pointerEvents: 'none',
    backgroundColor: 'rgba(22, 21, 15, 0.78)',
  },
  veilTitle: {color: colors.bone, textAlign: 'center'},
  veilText: {color: colors.stone, textAlign: 'center'},
  hint: {textAlign: 'center'},
});
