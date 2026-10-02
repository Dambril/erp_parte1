import React, {useState} from 'react';
import {RefreshControl, ScrollView, StyleSheet, Text, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {colors} from '@erp/ui';
import {
  formatDate, formatMoney, formatNumber, PROJECT_TYPE_LABEL, PROPOSAL_STATUS_LABEL, proposalHasAmounts,
} from '@erp/domain';
import {typography} from '../theme/typography';
import {proposalStatusTone} from '../theme/status';
import {useAuth} from '../state/AuthContext';
import {useResource} from '../hooks/useResource';
import {apiClient} from '../lib/apiClient';
import {Card, Notice} from '../components/Card';
import {PrimaryButton} from '../components/PrimaryButton';
import {StatusBadge} from '../components/StatusBadge';
import {TextLink} from '../components/TextLink';
import {ApproveSheet, RejectSheet} from '../sheets/ProposalSheets';
import type {RootStackParamList} from '../navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'ProposalDetail'>;

const NO_TARGET = 'Sin meta';

export function ProposalDetailScreen({route, navigation}: Props): React.ReactElement {
  const {proposalId} = route.params;
  const {can} = useAuth();
  const [sheet, setSheet] = useState<'approve' | 'reject' | null>(null);
  const {data: proposal, loading, error, reload} = useResource(
    () => apiClient.construction.proposals.get(proposalId),
    `proposal:${proposalId}`,
  );

  if (!proposal) {
    return (
      <View style={[styles.screen, styles.center]}>
        <Notice text={error ?? 'Cargando…'} tone={error ? 'error' : 'muted'} />
      </View>
    );
  }

  const inReview = proposal.status === 'in_review';
  const canApprove = inReview && can('construction.proposals:approve');
  const canReject = inReview && can('construction.proposals:reject');
  const {certification, targets} = proposal;

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} />}>
        <View style={styles.header}>
          <Text style={[typography.h1, styles.title]}>{proposal.name}</Text>
          <StatusBadge label={PROPOSAL_STATUS_LABEL[proposal.status]} tone={proposalStatusTone[proposal.status]} />
        </View>
        <Text style={[typography.body, styles.muted]}>
          {/* Un borrador puede no tener aún cliente, ubicación o tipo. */}
          {[proposal.folio, proposal.client?.name, proposal.location, proposal.type && PROJECT_TYPE_LABEL[proposal.type]]
            .filter(Boolean).join(' · ')}
        </Text>
        <Text style={[typography.bodySmall, styles.muted]}>
          {proposal.submittedAt ? `Enviada el ${formatDate(proposal.submittedAt)}` : 'Sin enviar'}
        </Text>
        {error ? <Notice text={error} tone="error" /> : null}

        {proposal.status === 'rejected' && proposal.rejectionReason ? (
          <Card title="Motivo del rechazo">
            <Text style={[typography.body, styles.text]}>{proposal.rejectionReason}</Text>
          </Card>
        ) : null}
        {proposal.projectId ? (
          <TextLink
            label="Ver la obra creada"
            onPress={() => navigation.navigate('ProjectDetail', {projectId: proposal.projectId!})}
            style={styles.link}
          />
        ) : null}

        <Card title="Alcance">
          <Text style={[typography.body, styles.text]}>{proposal.scope || 'Sin descripción.'}</Text>
        </Card>

        <Card title="Impacto estimado">
          <Row label="CO₂ evitado" value={targets.co2TonsPerYear === null ? NO_TARGET : `${formatNumber(targets.co2TonsPerYear)} t/año`} />
          <Row label="Ahorro de energía" value={targets.energySavingPct === null ? NO_TARGET : `${targets.energySavingPct}%`} />
          <Row label="Agua" value={targets.waterM3PerYear === null ? NO_TARGET : `${formatNumber(targets.waterM3PerYear)} m³/año`} />
        </Card>

        <Card title="Materiales">
          {proposal.materials.length === 0 ? <Notice text="Sin materiales registrados." /> : null}
          {proposal.materials.map((material, index) => (
            <View key={`${material.name}-${index}`} style={styles.material}>
              <Text style={[typography.body, styles.text]}>{material.name}</Text>
              <Text style={[typography.bodySmall, styles.muted]}>
                {material.supplier} · origen {material.origin}
              </Text>
            </View>
          ))}
        </Card>

        {/* Solo si la API envió el monto. */}
        {proposalHasAmounts(proposal) ? (
          <Card title="Presupuesto estimado">
            {proposal.estimatedBudget ? (
              <Text style={[typography.h1, styles.title]}>{formatMoney(proposal.estimatedBudget)}</Text>
            ) : (
              <Notice text="Sin capturar." />
            )}
          </Card>
        ) : null}

        <Card title="Certificación objetivo">
          <Text style={[typography.body, styles.text]}>
            {!certification
              ? 'Sin elegir.'
              : certification.type === 'none'
                ? 'Sin certificación objetivo.'
                : [certification.type, certification.level].filter(Boolean).join(' ')}
          </Text>
        </Card>
      </ScrollView>

      {canApprove || canReject ? (
        <View style={styles.bar}>
          {canReject ? (
            <PrimaryButton label="Rechazar" variant="secondary" onPress={() => setSheet('reject')} style={styles.barButton} />
          ) : null}
          {canApprove ? <PrimaryButton label="Aprobar" onPress={() => setSheet('approve')} style={styles.barButton} /> : null}
        </View>
      ) : null}

      <ApproveSheet
        visible={sheet === 'approve'}
        proposal={proposal}
        onClose={() => setSheet(null)}
        onApproved={(projectId) => navigation.replace('ProjectDetail', {projectId})}
      />
      <RejectSheet visible={sheet === 'reject'} proposal={proposal} onClose={() => setSheet(null)} onRejected={reload} />
    </View>
  );
}

function Row({label, value}: {label: string; value: string}): React.ReactElement {
  return (
    <View style={styles.row}>
      <Text style={[typography.body, styles.muted]}>{label}</Text>
      <Text style={[typography.h3, styles.text]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.bone},
  center: {alignItems: 'center', justifyContent: 'center', padding: 24},
  content: {padding: 20, paddingBottom: 28, gap: 14},
  header: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8},
  title: {flexShrink: 1, color: colors.ink},
  text: {color: colors.ink},
  muted: {color: colors.inkSecondary},
  link: {alignSelf: 'flex-start'},
  material: {gap: 2},
  row: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8},
  bar: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.white,
  },
  barButton: {flex: 1},
});
