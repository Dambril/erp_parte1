import React from 'react';
import {StyleSheet, View} from 'react-native';
import {colors} from '../theme/colors';

export function ProgressBar({progreso}: {progreso: number}): React.ReactElement {
  const pct = Math.max(0, Math.min(100, progreso));
  const fill = pct >= 100 ? colors.exito : colors.lima;
  return (
    <View style={styles.track}>
      <View style={[styles.fill, {width: `${pct}%`, backgroundColor: fill}]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 8,
    borderRadius: 999,
    backgroundColor: '#EAEAE4',
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 999,
  },
});
