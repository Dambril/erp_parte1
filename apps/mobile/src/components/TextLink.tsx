import React from 'react';
import {StyleSheet, Text, TouchableOpacity, type ViewStyle} from 'react-native';
import {colors} from '../theme/colors';
import {typography} from '../theme/typography';

interface Props {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  style?: ViewStyle;
}

export function TextLink({label, onPress, disabled, style}: Props): React.ReactElement {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="link"
      hitSlop={8}
      style={[styles.wrap, disabled && styles.disabled, style]}>
      <Text style={[typography.body, styles.text]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: {alignSelf: 'center', paddingVertical: 4},
  disabled: {opacity: 0.5},
  text: {color: colors.verdeBosqueClaro, fontWeight: '600', textDecorationLine: 'underline'},
});
