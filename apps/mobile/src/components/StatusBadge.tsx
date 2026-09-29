import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {colors, estadoColor, estadoLabel, type ObraEstado} from '../theme/colors';
import {typography} from '../theme/typography';

export function StatusBadge({estado}: {estado: ObraEstado}): React.ReactElement {
  const bg = estadoColor[estado];
  return (
    <View style={[styles.badge, {backgroundColor: bg}]}>
      <Text style={[typography.label, styles.text]}>{estadoLabel[estado]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  text: {
    color: colors.blanco,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
});
