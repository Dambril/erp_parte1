import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {radii} from '@erp/ui';
import {typography} from '../theme/typography';
import type {Tone} from '../theme/status';

export function StatusBadge({label, tone}: {label: string; tone: Tone}): React.ReactElement {
  return (
    <View
      style={[
        styles.badge,
        {backgroundColor: tone.background, borderColor: tone.border ?? tone.background},
      ]}>
      <Text style={[typography.label, styles.text, {color: tone.text}]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.pill,
    borderWidth: 1,
  },
  text: {
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
});
