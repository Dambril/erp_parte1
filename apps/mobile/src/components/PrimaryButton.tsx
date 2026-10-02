import React from 'react';
import {ActivityIndicator, StyleSheet, Text, TouchableOpacity, ViewStyle} from 'react-native';
import {colors as tokens, radii, touchTarget} from '@erp/ui';
import {colors} from '../theme/colors';
import {typography} from '../theme/typography';

interface Props {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  /** `danger` solo para eliminar. */
  variant?: 'primary' | 'secondary' | 'danger';
  style?: ViewStyle;
}

export function PrimaryButton({
  label,
  onPress,
  loading,
  disabled,
  variant = 'primary',
  style,
}: Props): React.ReactElement {
  const textColor = variant === 'danger' ? tokens.white : colors.negro;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityState={{disabled: !!(disabled || loading)}}
      style={[styles.base, styles[variant], (disabled || loading) && styles.disabled, style]}>
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <Text style={[typography.h3, {color: textColor}]}>{label}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: touchTarget,
    borderRadius: radii.button,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: {
    backgroundColor: colors.lima,
  },
  secondary: {
    backgroundColor: colors.blanco,
    borderWidth: 1,
    borderColor: colors.linea,
  },
  danger: {
    backgroundColor: tokens.danger,
  },
  disabled: {
    opacity: 0.6,
  },
});
