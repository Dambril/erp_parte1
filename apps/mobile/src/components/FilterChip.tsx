import React from 'react';
import {StyleSheet, Text, TouchableOpacity} from 'react-native';
import {radii, touchTarget} from '@erp/ui';
import {colors} from '../theme/colors';
import {typography} from '../theme/typography';

export function FilterChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}): React.ReactElement {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityState={{selected: active}}
      style={[styles.chip, active && styles.chipActive]}>
      <Text style={[typography.bodySmall, styles.text, active && styles.textActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: touchTarget,
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.linea,
    backgroundColor: colors.blanco,
  },
  chipActive: {
    backgroundColor: colors.verdeBosque,
    borderColor: colors.verdeBosque,
  },
  text: {
    color: colors.negro,
    fontWeight: '600',
  },
  textActive: {
    color: colors.blanco,
  },
});
