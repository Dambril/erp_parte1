import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {colors, radii} from '@erp/ui';
import {typography} from '../theme/typography';

/** "Paso 2 de 4" con el título del paso y una barra de avance. `step` empieza en 0. */
export function StepIndicator({step, titles}: {step: number; titles: readonly string[]}): React.ReactElement {
  return (
    <View style={styles.wrapper} accessibilityRole="header">
      <Text style={[typography.label, styles.count]}>
        Paso {step + 1} de {titles.length}
      </Text>
      <Text style={[typography.h2, styles.title]}>{titles[step]}</Text>
      <View style={styles.track}>
        {titles.map((title, index) => (
          <View key={title} style={[styles.segment, index <= step && styles.done]} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {gap: 6},
  count: {color: colors.inkSecondary, textTransform: 'uppercase', letterSpacing: 0.4},
  title: {color: colors.ink},
  track: {flexDirection: 'row', gap: 6, marginTop: 4},
  segment: {flex: 1, height: 6, borderRadius: radii.pill, backgroundColor: colors.line},
  done: {backgroundColor: colors.lime},
});
