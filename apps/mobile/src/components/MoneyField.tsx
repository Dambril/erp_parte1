import React from 'react';
import {formatMoney, parseMoneyInput} from '@erp/domain';
import {TextField} from './TextField';

export const MONEY_INPUT_ERROR = 'Escribe un monto mayor que cero, con hasta dos decimales.';

interface Props {
  label: string;
  /** Lo que escribe la persona. Se convierte con `parseMoneyInput`, nunca con `Number`. */
  value: string;
  onChangeText: (text: string) => void;
  error?: string | null;
  /** Monto ya interpretado para la ayuda bajo el campo (p. ej. con el signo de una reducción). */
  preview?: string | null;
}

export function MoneyField({label, value, onChangeText, error, preview}: Props): React.ReactElement {
  const parsed = parseMoneyInput(value);
  const shown = preview ?? parsed;
  return (
    <TextField
      label={label}
      value={value}
      onChangeText={onChangeText}
      keyboardType="decimal-pad"
      placeholder="0.00"
      error={error ?? (value.trim() && !parsed ? MONEY_INPUT_ERROR : null)}
      hint={shown ? formatMoney(shown) : undefined}
    />
  );
}
