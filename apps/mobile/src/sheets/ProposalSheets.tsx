import React, {useEffect, useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {colors} from '@erp/ui';
import {BottomSheet} from '../components/BottomSheet';
import {Notice} from '../components/Card';
import {PrimaryButton} from '../components/PrimaryButton';
import {TextField} from '../components/TextField';
import {useSubmit} from '../hooks/useSubmit';
import {apiClient} from '../lib/apiClient';
import {typography} from '../theme/typography';

interface SheetProps {
  visible: boolean;
  onClose: () => void;
  proposal: {id: string; name: string};
}

export function ApproveSheet({
  visible,
  onClose,
  proposal,
  onApproved,
}: SheetProps & {onApproved: (projectId: string) => void}): React.ReactElement {
  const {busy, error, clearError, submit} = useSubmit();
  useEffect(() => {
    if (visible) clearError();
  }, [visible, clearError]);

  const approve = () =>
    submit(
      () => apiClient.construction.proposals.approve(proposal.id),
      (approved) => {
        onClose();
        if (approved.projectId) onApproved(approved.projectId);
      },
    );

  return (
    <BottomSheet visible={visible} title="Aprobar propuesta" onClose={onClose}>
      <Text style={[typography.body, styles.text]}>
        Al aprobarla se crea la obra {proposal.name} en Planeación.
      </Text>
      {error ? <Notice text={error} tone="error" /> : null}
      <View style={styles.actions}>
        <PrimaryButton label="Cancelar" variant="secondary" onPress={onClose} disabled={busy} style={styles.action} />
        <PrimaryButton label="Aprobar" onPress={approve} loading={busy} style={styles.action} />
      </View>
    </BottomSheet>
  );
}

export function RejectSheet({
  visible,
  onClose,
  proposal,
  onRejected,
}: SheetProps & {onRejected: () => void}): React.ReactElement {
  const {busy, error, clearError, submit} = useSubmit();
  const [reason, setReason] = useState('');
  useEffect(() => {
    if (visible) {
      setReason('');
      clearError();
    }
  }, [visible, clearError]);

  const reject = () =>
    submit(
      () => apiClient.construction.proposals.reject(proposal.id, reason.trim()),
      () => {
        onClose();
        onRejected();
      },
    );

  return (
    <BottomSheet visible={visible} title="Rechazar propuesta" onClose={onClose}>
      <Text style={[typography.body, styles.text]}>Indica por qué se rechaza {proposal.name}.</Text>
      <TextField
        label="Motivo (obligatorio)"
        value={reason}
        onChangeText={setReason}
        multiline
        maxLength={1000}
        placeholder="Describe el motivo del rechazo"
      />
      {error ? <Notice text={error} tone="error" /> : null}
      <View style={styles.actions}>
        <PrimaryButton label="Cancelar" variant="secondary" onPress={onClose} disabled={busy} style={styles.action} />
        <PrimaryButton label="Rechazar" onPress={reject} loading={busy} disabled={!reason.trim()} style={styles.action} />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  text: {color: colors.ink, fontSize: 15, lineHeight: 22},
  actions: {flexDirection: 'row', gap: 12, marginTop: 4},
  action: {flex: 1},
});
