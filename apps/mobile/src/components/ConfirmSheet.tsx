import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {colors} from '@erp/ui';
import {typography} from '../theme/typography';
import {BottomSheet} from './BottomSheet';
import {Notice} from './Card';
import {PrimaryButton} from './PrimaryButton';

interface Props {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  /** `danger` solo para eliminar. */
  variant?: 'primary' | 'danger';
  busy?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onClose: () => void;
}

/** Confirmación de una acción con consecuencias (desactivar, eliminar). */
export function ConfirmSheet({
  visible, title, message, confirmLabel, variant = 'primary', busy, error, onConfirm, onClose,
}: Props): React.ReactElement {
  return (
    <BottomSheet visible={visible} title={title} onClose={onClose}>
      <Text style={[typography.body, styles.text]}>{message}</Text>
      {error ? <Notice text={error} tone="error" /> : null}
      <View style={styles.actions}>
        <PrimaryButton label="Cancelar" variant="secondary" onPress={onClose} disabled={busy} style={styles.action} />
        <PrimaryButton label={confirmLabel} variant={variant} onPress={onConfirm} loading={busy} style={styles.action} />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  text: {color: colors.ink},
  actions: {flexDirection: 'row', gap: 12, marginTop: 4},
  action: {flex: 1},
});
