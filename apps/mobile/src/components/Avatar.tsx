import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {colors, radii} from '@erp/ui';
import {typography} from '../theme/typography';

/** "Ana María López" → "AM". */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map((word) => word[0]!.toUpperCase()).join('') || '?';
}

/** Iniciales en un círculo verde bosque con texto blanco. */
export function Avatar({name, size = 44}: {name: string; size?: number}): React.ReactElement {
  return (
    <View
      style={[styles.circle, {width: size, height: size}]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <Text style={[size > 50 ? typography.h2 : typography.h3, styles.text]}>{initials(name)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {borderRadius: radii.pill, backgroundColor: colors.forest, alignItems: 'center', justifyContent: 'center'},
  text: {color: colors.white},
});
