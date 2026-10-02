import React from 'react';
import {FlatList, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {useNavigation} from '@react-navigation/native';
import {colors, radii, touchTarget} from '@erp/ui';
import {formatNumber, type AttentionItem, type DashboardKpis} from '@erp/domain';
import {typography} from '../theme/typography';
import {tones} from '../theme/status';
import {useAuth} from '../state/AuthContext';
import {useResource} from '../hooks/useResource';
import {apiClient} from '../lib/apiClient';
import {Notice} from '../components/Card';
import {PrimaryButton} from '../components/PrimaryButton';
import {ProjectCard} from '../components/ProjectCard';
import {StatusBadge} from '../components/StatusBadge';
import type {RootStackParamList} from '../navigation/RootNavigator';

type Nav = NativeStackNavigationProp<RootStackParamList>;

interface Kpi {
  key: string;
  label: string;
  value: string;
}

function kpiTiles(kpis: DashboardKpis): Kpi[] {
  return [
    {key: 'active', label: 'Obras activas', value: String(kpis.activeProjects)},
    {key: 'progress', label: 'Avance promedio', value: `${kpis.averageProgressPct}%`},
    {key: 'co2', label: 'CO₂ evitado (t/año)', value: formatNumber(kpis.co2TonsPerYear)},
    {key: 'budget', label: 'Presupuesto ejercido', value: `${kpis.budgetSpentPct}%`},
  ];
}

function attentionText(item: AttentionItem): {title: string; detail: string} {
  switch (item.kind) {
    case 'proposal_in_review':
      return {title: item.name, detail: `Propuesta ${item.folio} en revisión`};
    case 'project_delayed':
      return {title: item.name, detail: `Retraso de ${item.delayDays} días`};
    case 'budget_near_limit':
      return {title: item.name, detail: `${item.spentPct}% del presupuesto ejercido`};
    case 'requirement_pending':
      return {title: item.name, detail: `Requisito pendiente: ${item.title}`};
  }
}

export function DashboardScreen(): React.ReactElement {
  const {user, can} = useAuth();
  const navigation = useNavigation<Nav>();
  const {data, loading, error, reload} = useResource(() => apiClient.construction.dashboard(), 'dashboard');

  const openProject = (projectId: string) => navigation.navigate('ProjectDetail', {projectId});
  const openAttention = (item: AttentionItem) =>
    item.kind === 'proposal_in_review'
      ? navigation.navigate('ProposalDetail', {proposalId: item.proposalId})
      : openProject(item.projectId);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} />}>
      <View style={styles.topRow}>
        <Text style={[typography.h2, styles.title]} numberOfLines={1}>
          Hola, {user?.name ?? ''}
        </Text>
        {can('identity.users:manage') ? <StatusBadge label="Administrador" tone={tones.forest} /> : null}
      </View>
      {error ? <Notice text={error} tone="error" /> : null}

      {/* La API solo envía `attention` a quien puede actuar sobre esos pendientes. */}
      {data?.attention ? (
        <View style={styles.section}>
          <Text style={[typography.h3, styles.title]}>Requiere tu atención</Text>
          {data.attention.length === 0 ? <Notice text="Todo al día." /> : null}
          {data.attention.map((item, index) => {
            const {title, detail} = attentionText(item);
            return (
              <TouchableOpacity
                key={`${item.kind}-${index}`}
                style={styles.attentionRow}
                onPress={() => openAttention(item)}
                accessibilityRole="button">
                <View style={styles.attentionText}>
                  <Text style={[typography.body, styles.attentionTitle]} numberOfLines={1}>
                    {title}
                  </Text>
                  <Text style={[typography.bodySmall, styles.muted]} numberOfLines={2}>
                    {detail}
                  </Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}

      {can('construction.proposals:create') ? (
        <View style={styles.newProposal}>
          {/* El formulario de propuestas llega en el Bloque 3. */}
          <PrimaryButton label="Nueva propuesta" onPress={() => undefined} disabled />
          <Text style={[typography.bodySmall, styles.muted]}>Disponible próximamente.</Text>
        </View>
      ) : null}

      {data ? (
        <FlatList
          horizontal
          data={kpiTiles(data.kpis)}
          keyExtractor={(kpi) => kpi.key}
          showsHorizontalScrollIndicator={false}
          style={styles.carousel}
          contentContainerStyle={styles.carouselContent}
          renderItem={({item}) => (
            <View style={styles.kpi}>
              <Text style={[typography.h1, styles.kpiValue]}>{item.value}</Text>
              <Text style={[typography.bodySmall, styles.kpiLabel]}>{item.label}</Text>
            </View>
          )}
        />
      ) : null}

      <View style={styles.section}>
        <Text style={[typography.h3, styles.title]}>Obras en curso</Text>
        {data?.projectsInProgress.map((project) => (
          <ProjectCard key={project.id} project={project} onPress={() => openProject(project.id)} />
        ))}
        {data && data.projectsInProgress.length === 0 ? <Notice text="No hay obras en curso." /> : null}
      </View>

      <View style={styles.section}>
        <Text style={[typography.h3, styles.title]}>Certificaciones en proceso</Text>
        {data?.certificationsInProgress.map((certification) => (
          <TouchableOpacity
            key={certification.projectId}
            style={styles.attentionRow}
            onPress={() => openProject(certification.projectId)}
            accessibilityRole="button">
            <View style={styles.attentionText}>
              <Text style={[typography.body, styles.attentionTitle]} numberOfLines={1}>
                {certification.projectName}
              </Text>
              <Text style={[typography.bodySmall, styles.muted]}>
                {[certification.type, certification.level].filter(Boolean).join(' ')} · {certification.requirementsMet} de{' '}
                {certification.requirementsTotal} requisitos cumplidos
              </Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
        ))}
        {data && data.certificationsInProgress.length === 0 ? <Notice text="Sin certificaciones en proceso." /> : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.bone},
  content: {padding: 20, paddingBottom: 40, gap: 18},
  topRow: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12},
  title: {color: colors.ink, flexShrink: 1},
  muted: {color: colors.inkSecondary},
  section: {gap: 10},
  attentionRow: {
    minHeight: touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.card,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  attentionText: {flex: 1, gap: 2},
  attentionTitle: {color: colors.ink, fontWeight: '600'},
  chevron: {fontSize: 22, color: colors.stone},
  newProposal: {gap: 6},
  // El carrusel llega hasta los bordes de la pantalla.
  carousel: {marginHorizontal: -20},
  carouselContent: {paddingHorizontal: 20, gap: 12},
  kpi: {
    width: 168,
    backgroundColor: colors.forest,
    borderRadius: radii.card,
    padding: 16,
    gap: 6,
  },
  kpiValue: {color: colors.lime},
  kpiLabel: {color: colors.white},
});
