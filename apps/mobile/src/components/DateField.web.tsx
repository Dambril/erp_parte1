import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {colors, fontFaces, radii, touchTarget} from '@erp/ui';
import {typography} from '../theme/typography';

interface Props {
  label: string;
  /** Fecha `AAAA-MM-DD` o `null` si aún no se elige. */
  value: string | null;
  onChange: (value: string | null) => void;
  error?: string | null;
}

/** Misma interfaz que el campo nativo, con el selector de fechas del navegador (que ya trabaja en `AAAA-MM-DD`). */
export function DateField({label, value, onChange, error}: Props): React.ReactElement {
  return (
    <View style={styles.wrapper}>
      <Text style={[typography.label, styles.label]}>{label}</Text>
      <input
        type="date"
        aria-label={label}
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value || null)}
        style={{
          minHeight: touchTarget,
          boxSizing: 'border-box',
          padding: '0 14px',
          border: `1px solid ${error ? colors.danger : colors.line}`,
          borderRadius: radii.input,
          backgroundColor: colors.white,
          color: colors.ink,
          fontFamily: fontFaces.body,
          fontSize: 14,
        }}
      />
      {error ? <Text style={[typography.bodySmall, styles.error]}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {gap: 6},
  label: {color: colors.stone, textTransform: 'uppercase', letterSpacing: 0.4},
  error: {color: colors.danger},
});
