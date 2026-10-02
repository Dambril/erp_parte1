import React from 'react';
import {StyleSheet, Text, View, type ViewStyle} from 'react-native';
import {colors, radii} from '@erp/ui';
import {typography} from '../theme/typography';

interface Props {
  title?: string;
  /** Control a la derecha del título (p. ej. un botón de acción). */
  action?: React.ReactNode;
  children: React.ReactNode;
  style?: ViewStyle;
}

export function Card({title, action, children, style}: Props): React.ReactElement {
  return (
    <View style={[styles.card, style]}>
      {title || action ? (
        <View style={styles.header}>
          {title ? <Text style={[typography.h3, styles.title]}>{title}</Text> : <View />}
          {action}
        </View>
      ) : null}
      {children}
    </View>
  );
}

/** Aviso ámbar (retraso) con texto negro. */
export function Banner({text}: {text: string}): React.ReactElement {
  return (
    <View style={styles.banner} accessibilityRole="alert">
      <Text style={[typography.body, styles.bannerText]}>{text}</Text>
    </View>
  );
}

/** Estado de carga, error o vacío de una pantalla o sección. */
export function Notice({text, tone = 'muted'}: {text: string; tone?: 'muted' | 'error'}): React.ReactElement {
  return <Text style={[typography.body, tone === 'error' ? styles.error : styles.muted]}>{text}</Text>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.card,
    padding: 16,
    gap: 10,
  },
  header: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8},
  title: {color: colors.ink, flexShrink: 1},
  banner: {backgroundColor: colors.amber, borderRadius: radii.button, padding: 14},
  bannerText: {color: colors.ink, fontWeight: '600'},
  muted: {color: colors.inkSecondary},
  error: {color: colors.danger},
});
