import React from 'react';
import {ActivityIndicator, StyleSheet, Text, TouchableOpacity, ViewStyle} from 'react-native';
import {colors} from '../theme/colors';
import {typography} from '../theme/typography';

interface Props {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary';
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
  const isSecondary = variant === 'secondary';
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
      style={[
        styles.base,
        isSecondary ? styles.secondary : styles.primary,
        (disabled || loading) && styles.disabled,
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={isSecondary ? colors.negro : colors.negro} />
      ) : (
        <Text style={[typography.h3, isSecondary ? styles.secondaryText : styles.primaryText]}>
          {label}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 12,
    paddingVertical: 14,
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
  disabled: {
    opacity: 0.6,
  },
  primaryText: {
    color: colors.negro,
  },
  secondaryText: {
    color: colors.negro,
  },
});
