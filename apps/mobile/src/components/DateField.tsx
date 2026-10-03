import React, {useState} from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import DateTimePicker, {type DateTimePickerEvent} from '@react-native-community/datetimepicker';
import {colors, radii, touchTarget} from '@erp/ui';
import {formatDate} from '@erp/domain';
import {typography} from '../theme/typography';

interface Props {
  label: string;
  /** Fecha `AAAA-MM-DD` o `null` si aún no se elige. */
  value: string | null;
  onChange: (value: string | null) => void;
  error?: string | null;
}

// La fecha se arma con los componentes locales: `toISOString` la movería un día según la zona horaria.
const pad = (value: number) => String(value).padStart(2, '0');
const toDateString = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
function fromDateString(value: string | null): Date {
  if (!value) return new Date();
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/** Campo de fecha con el selector nativo. Se puede dejar vacío (un borrador no exige fechas). */
export function DateField({label, value, onChange, error}: Props): React.ReactElement {
  const [open, setOpen] = useState(false);

  const picked = (event: DateTimePickerEvent, date?: Date) => {
    setOpen(false);
    if (event.type === 'set' && date) onChange(toDateString(date));
  };

  return (
    <View style={styles.wrapper}>
      <Text style={[typography.label, styles.label]}>{label}</Text>
      <View style={styles.row}>
        <TouchableOpacity
          onPress={() => setOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={`${label}: ${value ? formatDate(value) : 'sin elegir'}`}
          style={[styles.field, !!error && styles.fieldError]}>
          <Text style={[typography.body, value ? styles.value : styles.placeholder]}>
            {value ? formatDate(value) : 'Elegir fecha'}
          </Text>
        </TouchableOpacity>
        {value ? (
          <TouchableOpacity onPress={() => onChange(null)} accessibilityRole="button" accessibilityLabel={`Quitar ${label}`} style={styles.clear}>
            <Text style={[typography.bodySmall, styles.clearText]}>Quitar</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {error ? <Text style={[typography.bodySmall, styles.error]}>{error}</Text> : null}
      {open ? <DateTimePicker value={fromDateString(value)} mode="date" onChange={picked} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {gap: 6},
  label: {color: colors.stone, textTransform: 'uppercase', letterSpacing: 0.4},
  row: {flexDirection: 'row', alignItems: 'center', gap: 8},
  field: {
    flex: 1,
    minHeight: touchTarget,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.input,
    backgroundColor: colors.white,
  },
  fieldError: {borderColor: colors.danger},
  value: {color: colors.ink},
  placeholder: {color: colors.stone},
  clear: {minHeight: touchTarget, minWidth: touchTarget, justifyContent: 'center', alignItems: 'center'},
  clearText: {color: colors.inkSecondary, fontWeight: '600'},
  error: {color: colors.danger},
});
