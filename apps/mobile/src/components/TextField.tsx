import React from 'react';
import {StyleSheet, Text, TextInput, TextInputProps, View} from 'react-native';
import {colors} from '../theme/colors';
import {typography} from '../theme/typography';

interface Props extends TextInputProps {
  label: string;
  error?: string | null;
  /** Ayuda bajo el campo (se oculta si hay error). */
  hint?: string;
  /** Control dentro del campo, a la derecha (p. ej. mostrar/ocultar contraseña). */
  rightAccessory?: React.ReactNode;
}

export function TextField({label, error, hint, rightAccessory, style, ...inputProps}: Props): React.ReactElement {
  return (
    <View style={styles.wrapper}>
      <Text style={[typography.label, styles.label]}>{label}</Text>
      <View style={[styles.inputRow, !!error && styles.inputError]}>
        <TextInput
          accessibilityLabel={label}
          {...inputProps}
          placeholderTextColor={colors.piedra}
          style={[styles.input, style]}
        />
        {rightAccessory}
      </View>
      {error ? (
        <Text style={[typography.bodySmall, styles.error]}>{error}</Text>
      ) : hint ? (
        <Text style={[typography.bodySmall, styles.hint]}>{hint}</Text>
      ) : null}
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
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.linea,
    borderRadius: 10,
    backgroundColor: colors.blanco,
  },
  input: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: typography.body.fontFamily,
    fontSize: 14,
    color: colors.negro,
  },
  inputError: {
    borderColor: colors.terracota,
  },
  error: {
    color: colors.terracota,
  },
  hint: {
    color: colors.piedra,
  },
});
