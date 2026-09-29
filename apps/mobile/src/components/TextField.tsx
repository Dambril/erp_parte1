import React from 'react';
import {StyleSheet, Text, TextInput, TextInputProps, View} from 'react-native';
import {colors} from '../theme/colors';
import {typography} from '../theme/typography';

interface Props extends TextInputProps {
  label: string;
  error?: string | null;
}

export function TextField({label, error, style, ...inputProps}: Props): React.ReactElement {
  return (
    <View style={styles.wrapper}>
      <Text style={[typography.label, styles.label]}>{label}</Text>
      <TextInput
        {...inputProps}
        placeholderTextColor={colors.piedra}
        style={[styles.input, !!error && styles.inputError, style]}
      />
      {error ? <Text style={[typography.bodySmall, styles.error]}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: 6,
  },
  label: {
    color: colors.piedra,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.linea,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: colors.negro,
    backgroundColor: colors.blanco,
  },
  inputError: {
    borderColor: colors.terracota,
  },
  error: {
    color: colors.terracota,
  },
});
