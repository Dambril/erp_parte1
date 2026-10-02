import React from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {colors, radii} from '@erp/ui';
import {
  formatDate, formatMoney, PROPOSAL_STATUS_LABEL, proposalHasAmounts, type ProposalSummary, type ProposalSummaryWithAmounts,
} from '@erp/domain';
import {typography} from '../theme/typography';
import {proposalStatusTone} from '../theme/status';
import {StatusBadge} from './StatusBadge';

interface Props {
  proposal: ProposalSummary | ProposalSummaryWithAmounts;
  onPress: () => void;
}

export function ProposalCard({proposal, onPress}: Props): React.ReactElement {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7} accessibilityRole="button">
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={[typography.h3, styles.name]} numberOfLines={1}>
            {proposal.name}
          </Text>
          <Text style={[typography.bodySmall, styles.muted]} numberOfLines={1}>
            {proposal.client?.name ?? 'Sin cliente'}
          </Text>
        </View>
        <StatusBadge label={PROPOSAL_STATUS_LABEL[proposal.status]} tone={proposalStatusTone[proposal.status]} />
      </View>
      <View style={styles.footer}>
        <Text style={[typography.bodySmall, styles.muted]}>
          {proposal.submittedAt ? `Enviada el ${formatDate(proposal.submittedAt)}` : 'Sin enviar'}
        </Text>
        {/* El monto solo aparece si la API lo devolvió. */}
        {proposalHasAmounts(proposal) && proposal.estimatedBudget ? (
          <Text style={[typography.h3, styles.amount]}>{formatMoney(proposal.estimatedBudget)}</Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.card,
    padding: 14,
    gap: 12,
  },
  header: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8},
  headerText: {flex: 1, gap: 2},
  name: {color: colors.ink},
  muted: {color: colors.inkSecondary},
  footer: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8},
  amount: {color: colors.ink},
});
