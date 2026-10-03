import React, {useEffect, useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {colors} from '@erp/ui';
import {
  formatMoney, isNegativeMoney, negateMoney, parseMoneyInput, REQUIREMENT_STATUS_LABEL, RequirementStatusSchema,
  type BudgetMovement, type CertificationRequirement, type RequirementStatus,
} from '@erp/domain';
import {BottomSheet} from '../components/BottomSheet';
import {Notice} from '../components/Card';
import {FilterChip} from '../components/FilterChip';
import {MoneyField} from '../components/MoneyField';
import {PrimaryButton} from '../components/PrimaryButton';
import {TextField} from '../components/TextField';
import {useSubmit} from '../hooks/useSubmit';
import {apiClient} from '../lib/apiClient';
import {typography} from '../theme/typography';

interface SheetProps {
  visible: boolean;
  onClose: () => void;
}

interface ProjectRef {
  id: string;
  name: string;
}

// ── Archivar ───────────────────────────────────────────────────────

export function ArchiveSheet({
  visible,
  onClose,
  project,
  onArchived,
}: SheetProps & {project: ProjectRef; onArchived?: () => void}): React.ReactElement {
  const {busy, error, clearError, submit} = useSubmit();
  useEffect(() => {
    if (visible) clearError();
  }, [visible, clearError]);

  const archive = () =>
    submit(
      () => apiClient.construction.projects.archive(project.id),
      () => {
        onClose();
        onArchived?.();
      },
    );

  return (
    <BottomSheet visible={visible} title="Archivar obra" onClose={onClose}>
      <Text style={[typography.body, styles.text]}>
        {project.name} dejará de aparecer en obras activas. Su historial y movimientos se conservan y puedes restaurarla
        desde Archivadas.
      </Text>
      {error ? <Notice text={error} tone="error" /> : null}
      <View style={styles.actions}>
        <PrimaryButton label="Cancelar" variant="secondary" onPress={onClose} disabled={busy} style={styles.action} />
        <PrimaryButton label="Archivar" onPress={archive} loading={busy} style={styles.action} />
      </View>
    </BottomSheet>
  );
}

// ── Eliminar ───────────────────────────────────────────────────────

/** Dos variantes según `deletable`: confirmar escribiendo el nombre, o el bloqueo con salida a Archivar. */
export function DeleteSheet({
  visible,
  onClose,
  project,
  deletable,
  canArchive,
  onDeleted,
  onArchive,
}: SheetProps & {
  project: ProjectRef;
  deletable: boolean;
  canArchive: boolean;
  onDeleted: () => void;
  onArchive: () => void;
}): React.ReactElement {
  const {busy, error, clearError, submit} = useSubmit();
  const [typed, setTyped] = useState('');
  useEffect(() => {
    if (visible) {
      setTyped('');
      clearError();
    }
  }, [visible, clearError]);

  if (!deletable) {
    return (
      <BottomSheet visible={visible} title="Eliminar obra" onClose={onClose}>
        <Text style={[typography.body, styles.text]}>
          No se puede eliminar porque tiene movimientos de presupuesto. Archívala en su lugar.
        </Text>
        <View style={styles.actions}>
          <PrimaryButton label="Cancelar" variant="secondary" onPress={onClose} style={styles.action} />
          {canArchive ? <PrimaryButton label="Archivar" onPress={onArchive} style={styles.action} /> : null}
        </View>
      </BottomSheet>
    );
  }

  const remove = () =>
    submit(
      () => apiClient.construction.projects.remove(project.id),
      () => {
        onClose();
        onDeleted();
      },
    );

  return (
    <BottomSheet visible={visible} title="Eliminar obra" onClose={onClose}>
      <Text style={[typography.body, styles.text]}>
        Escribe el nombre de la obra para confirmar: <Text style={styles.strong}>{project.name}</Text>
      </Text>
      <TextField label="Nombre de la obra" value={typed} onChangeText={setTyped} autoCapitalize="none" autoCorrect={false} />
      <Text style={[typography.bodySmall, styles.muted]}>Podrás restaurarla desde la Papelera.</Text>
      {error ? <Notice text={error} tone="error" /> : null}
      <View style={styles.actions}>
        <PrimaryButton label="Cancelar" variant="secondary" onPress={onClose} disabled={busy} style={styles.action} />
        <PrimaryButton
          label="Eliminar"
          variant="danger"
          onPress={remove}
          loading={busy}
          disabled={typed.trim() !== project.name}
          style={styles.action}
        />
      </View>
    </BottomSheet>
  );
}

// ── Registrar ajuste / Corregir ────────────────────────────────────

type AdjustmentKind = 'increase' | 'reduction';

/** Con `reversing` es una corrección: el tipo y el monto quedan fijos en lo contrario del movimiento original. */
export function AdjustmentSheet({
  visible,
  onClose,
  projectId,
  reversing,
  onSaved,
}: SheetProps & {projectId: string; reversing: BudgetMovement | null; onSaved?: () => void}): React.ReactElement {
  const {busy, error, clearError, submit} = useSubmit();
  const [kind, setKind] = useState<AdjustmentKind>('increase');
  const [amountText, setAmountText] = useState('');
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (!visible) return;
    clearError();
    setKind('increase');
    setAmountText('');
    setReason(reversing ? `Corrección de ${reversing.folio}` : '');
  }, [visible, reversing, clearError]);

  // El monto se maneja siempre como string: `parseMoneyInput` valida y `negateMoney` cambia el signo.
  const entered = parseMoneyInput(amountText);
  const amount = reversing ? negateMoney(reversing.amount) : entered ? (kind === 'reduction' ? negateMoney(entered) : entered) : null;

  const save = () => {
    if (!amount) return;
    void submit(
      () => apiClient.construction.projects.adjust(projectId, {amount, reason: reason.trim(), reversesMovementId: reversing?.id}),
      () => {
        onClose();
        onSaved?.();
      },
    );
  };

  return (
    <BottomSheet visible={visible} title={reversing ? 'Corregir movimiento' : 'Registrar ajuste'} onClose={onClose}>
      {reversing ? (
        <View style={styles.reference}>
          <Text style={[typography.label, styles.muted]}>MOVIMIENTO ORIGINAL</Text>
          <Text style={[typography.body, styles.text]}>
            {reversing.folio} · {formatMoney(reversing.amount)}
          </Text>
          <Text style={[typography.bodySmall, styles.muted]}>{reversing.reason}</Text>
          <Text style={[typography.body, styles.text]}>
            Se registrará {isNegativeMoney(amount ?? '') ? 'una reducción' : 'un aumento'} de{' '}
            <Text style={styles.strong}>{formatMoney(amount ?? '0.00')}</Text>.
          </Text>
        </View>
      ) : (
        <>
          <View style={styles.chips}>
            <FilterChip label="Aumento" active={kind === 'increase'} onPress={() => setKind('increase')} />
            <FilterChip label="Reducción" active={kind === 'reduction'} onPress={() => setKind('reduction')} />
          </View>
          <MoneyField label="Monto (MXN)" value={amountText} onChangeText={setAmountText} preview={amount} />
        </>
      )}
      <TextField
        label="Motivo (obligatorio)"
        value={reason}
        onChangeText={setReason}
        multiline
        maxLength={500}
        placeholder="Por qué cambia el presupuesto"
      />
      <Text style={[typography.bodySmall, styles.muted]}>
        Los movimientos no se editan ni se borran. Para corregir uno, registra un ajuste contrario.
      </Text>
      {error ? <Notice text={error} tone="error" /> : null}
      <View style={styles.actions}>
        <PrimaryButton label="Cancelar" variant="secondary" onPress={onClose} disabled={busy} style={styles.action} />
        <PrimaryButton
          label={reversing ? 'Registrar corrección' : 'Registrar'}
          onPress={save}
          loading={busy}
          disabled={!amount || !reason.trim()}
          style={styles.action}
        />
      </View>
    </BottomSheet>
  );
}

// ── Actualizar requisito ───────────────────────────────────────────

export function RequirementSheet({
  visible,
  onClose,
  projectId,
  requirement,
  onSaved,
}: SheetProps & {projectId: string; requirement: CertificationRequirement | null; onSaved?: () => void}): React.ReactElement {
  const {busy, error, clearError, submit} = useSubmit();
  const [status, setStatus] = useState<RequirementStatus>('pending');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!visible || !requirement) return;
    clearError();
    setStatus(requirement.status);
    setNote(requirement.note);
  }, [visible, requirement, clearError]);

  const save = () => {
    if (!requirement) return;
    void submit(
      () => apiClient.construction.projects.updateRequirement(projectId, requirement.code, {status, note: note.trim()}),
      () => {
        onClose();
        onSaved?.();
      },
    );
  };

  return (
    <BottomSheet visible={visible} title="Actualizar requisito" onClose={onClose}>
      <Text style={[typography.body, styles.text]}>{requirement?.title}</Text>
      <View style={styles.chips}>
        {RequirementStatusSchema.options.map((option) => (
          <FilterChip key={option} label={REQUIREMENT_STATUS_LABEL[option]} active={status === option} onPress={() => setStatus(option)} />
        ))}
      </View>
      <TextField label="Nota" value={note} onChangeText={setNote} multiline maxLength={1000} placeholder="Evidencia o comentario" />
      {error ? <Notice text={error} tone="error" /> : null}
      <View style={styles.actions}>
        <PrimaryButton label="Cancelar" variant="secondary" onPress={onClose} disabled={busy} style={styles.action} />
        <PrimaryButton label="Guardar" onPress={save} loading={busy} style={styles.action} />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  text: {color: colors.ink, fontSize: 15, lineHeight: 22},
  strong: {fontWeight: '700', color: colors.ink},
  muted: {color: colors.inkSecondary},
  actions: {flexDirection: 'row', gap: 12, marginTop: 4},
  action: {flex: 1},
  chips: {flexDirection: 'row', gap: 8, flexWrap: 'wrap'},
  reference: {gap: 4, padding: 12, borderRadius: 12, backgroundColor: colors.bone},
});
