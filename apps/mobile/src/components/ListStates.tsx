import React, {useEffect, useRef} from 'react';
import {Animated, StyleSheet, Text, View} from 'react-native';
import {colors, radii} from '@erp/ui';
import {typography} from '../theme/typography';
import {useConnectivity} from '../state/ConnectivityContext';
import {PrimaryButton} from './PrimaryButton';

/** Tarjeta gris que late mientras carga la primera página de una lista. */
export function SkeletonCard(): React.ReactElement {
  const opacity = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {toValue: 1, duration: 700, useNativeDriver: true}),
        Animated.timing(opacity, {toValue: 0.5, duration: 700, useNativeDriver: true}),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [opacity]);

  return (
    <Animated.View style={[styles.skeleton, {opacity}]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={[styles.bar, styles.barTitle]} />
      <View style={[styles.bar, styles.barShort]} />
      <View style={styles.bar} />
    </Animated.View>
  );
}

export function ListSkeleton({count = 4}: {count?: number}): React.ReactElement {
  return (
    <View style={styles.stack} accessibilityLabel="Cargando" accessibilityRole="progressbar">
      {Array.from({length: count}, (_, index) => (
        <SkeletonCard key={index} />
      ))}
    </View>
  );
}

interface EmptyStateProps {
  title: string;
  text?: string;
  action?: {label: string; onPress: () => void};
}

export function EmptyState({title, text, action}: EmptyStateProps): React.ReactElement {
  return (
    <View style={styles.state}>
      <Text style={[typography.h3, styles.stateTitle]}>{title}</Text>
      {text ? <Text style={[typography.body, styles.stateText]}>{text}</Text> : null}
      {action ? <PrimaryButton label={action.label} onPress={action.onPress} style={styles.stateButton} /> : null}
    </View>
  );
}

export function ErrorState({message, onRetry}: {message: string; onRetry: () => void}): React.ReactElement {
  return (
    <View style={styles.state} accessibilityRole="alert">
      <Text style={[typography.h3, styles.stateTitle]}>No pudimos cargar la información</Text>
      <Text style={[typography.body, styles.stateText]}>{message}</Text>
      <PrimaryButton label="Reintentar" variant="secondary" onPress={onRetry} style={styles.stateButton} />
    </View>
  );
}

interface ListStateProps {
  loading: boolean;
  error: string | null;
  /** Búsqueda activa: sin resultados no es lo mismo que una lista vacía. */
  query?: string;
  empty: EmptyStateProps;
  onRetry: () => void;
}

/** Lo que muestra una lista sin elementos, según por qué está vacía. Va en `ListEmptyComponent`. */
export function ListState({loading, error, query, empty, onRetry}: ListStateProps): React.ReactElement {
  if (loading) return <ListSkeleton />;
  if (error) return <ErrorState message={error} onRetry={onRetry} />;
  if (query) return <EmptyState title={`No encontramos resultados para '${query}'`} text="Prueba con otras palabras." />;
  return <EmptyState {...empty} />;
}

/** Aviso fijo cuando el dispositivo no tiene conexión. */
export function OfflineBanner(): React.ReactElement | null {
  const online = useConnectivity();
  if (online) return null;
  return (
    <View style={styles.offline} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <Text style={[typography.h3, styles.offlineText]}>Sin conexión</Text>
      <Text style={[typography.bodySmall, styles.offlineText]}>Revisa tu internet. La lista se actualizará al volver.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {gap: 10},
  skeleton: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.card,
    padding: 14,
    gap: 10,
  },
  bar: {height: 12, borderRadius: 6, backgroundColor: colors.line},
  barTitle: {width: '60%', height: 16},
  barShort: {width: '40%'},
  state: {alignItems: 'center', paddingVertical: 32, paddingHorizontal: 12, gap: 8},
  stateTitle: {color: colors.ink, textAlign: 'center'},
  stateText: {color: colors.inkSecondary, textAlign: 'center'},
  stateButton: {alignSelf: 'stretch', marginTop: 8},
  offline: {backgroundColor: colors.amber, borderRadius: radii.button, paddingVertical: 10, paddingHorizontal: 14, gap: 2},
  offlineText: {color: colors.ink},
});
