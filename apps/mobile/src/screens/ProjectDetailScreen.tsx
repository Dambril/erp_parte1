import React, {useState} from 'react';
import {ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {colors} from '@erp/ui';
import {
  BUDGET_MOVEMENT_KIND_LABEL, budgetHasAmounts, formatDate, formatMoney, formatNumber, PHASE_STATUS_LABEL, PROJECT_STATUS_LABEL,
  PROJECT_TYPE_LABEL, REQUIREMENT_STATUS_LABEL,
  type ActivityEntry, type BudgetMovement, type CertificationRequirement, type ProjectDetail, type ProjectDetailWithAmounts,
} from '@erp/domain';
import {mensajeError} from '@erp/api-client';
import {typography} from '../theme/typography';
import {projectStatusTone, stepStatusTone} from '../theme/status';
import {useAuth} from '../state/AuthContext';
import {useConstruction} from '../state/ConstructionContext';
import {usePagedList, useResource} from '../hooks/useResource';
import {apiClient} from '../lib/apiClient';
import {ActionMenu, MoreButton, type MenuAction} from '../components/ActionMenu';
import {Banner, Card, Notice} from '../components/Card';
import {PrimaryButton} from '../components/PrimaryButton';
import {ProgressBar} from '../components/ProgressBar';
import {StatusBadge} from '../components/StatusBadge';
import {TextLink} from '../components/TextLink';
import {AdjustmentSheet, ArchiveSheet, DeleteSheet, RequirementSheet} from '../sheets/ProjectSheets';
import type {RootStackParamList} from '../navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'ProjectDetail'>;
type Project = ProjectDetail | ProjectDetailWithAmounts;
type Sheet = 'menu' | 'archive' | 'delete' | 'adjustment' | 'requirement' | null;

export function ProjectDetailScreen({route, navigation}: Props): React.ReactElement {
  const {projectId} = route.params;
  const {can} = useAuth();
  const {refresh} = useConstruction();
  const [sheet, setSheet] = useState<Sheet>(null);
  const [reversing, setReversing] = useState<BudgetMovement | null>(null);
  const [requirement, setRequirement] = useState<CertificationRequirement | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const canUpdate = can('construction.projects:update');
  const canArchive = can('construction.projects:archive');
  const canDelete = can('construction.projects:delete');
  const canAdjust = can('construction.budget:adjust');
  const canReadAmounts = can('construction.budget:read_amounts');
  const canUpdateRequirements = can('construction.certifications:update');

  const detail = useResource(() => apiClient.construction.projects.get(projectId), `project:${projectId}`);
  const activity = usePagedList(
    (page) => apiClient.construction.projects.activity(projectId, {page, pageSize: 20}),
    `activity:${projectId}`,
  );
  // El historial de movimientos lleva montos: solo se pide con permiso para verlos.
  const movements = usePagedList(
    (page) => apiClient.construction.projects.movements(projectId, {page, pageSize: 10}),
    `movements:${projectId}`,
    canReadAmounts,
  );

  const project = detail.data;
  if (!project) {
    return (
      <View style={[styles.screen, styles.center]}>
        <Notice text={detail.error ?? 'Cargando…'} tone={detail.error ? 'error' : 'muted'} />
      </View>
    );
  }

  const unarchive = async () => {
    setActionError(null);
    try {
      await apiClient.construction.projects.unarchive(project.id);
      refresh();
    } catch (err) {
      setActionError(mensajeError(err));
    }
  };

  const menu: MenuAction[] = [
    ...(canUpdate ? [{label: 'Editar obra', onPress: () => navigation.navigate('ProjectEdit', {projectId})}] : []),
    ...(canArchive
      ? [project.archivedAt ? {label: 'Desarchivar', onPress: () => void unarchive()} : {label: 'Archivar', onPress: () => setSheet('archive')}]
      : []),
    ...(canDelete ? [{label: 'Eliminar', danger: true, onPress: () => setSheet('delete')}] : []),
  ];

  const openAdjustment = (movement: BudgetMovement | null) => {
    setReversing(movement);
    setSheet('adjustment');
  };

  const header = (
    <View style={styles.cards}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={[typography.h1, styles.title]}>{project.name}</Text>
          <Text style={[typography.body, styles.muted]}>
            {project.folio} · {project.client.name} · {project.location} · {PROJECT_TYPE_LABEL[project.type]}
          </Text>
        </View>
        {menu.length > 0 ? <MoreButton onPress={() => setSheet('menu')} label="Acciones de la obra" /> : null}
      </View>
      <View style={styles.badges}>
        <StatusBadge label={PROJECT_STATUS_LABEL[project.status]} tone={projectStatusTone[project.status]} />
        {project.archivedAt ? <StatusBadge label="Archivada" tone={stepStatusTone.pending} /> : null}
      </View>
      {project.delayDays > 0 ? <Banner text={`Retraso de ${project.delayDays} días en la fase en curso.`} /> : null}
      {detail.error || actionError ? <Notice text={(detail.error || actionError)!} tone="error" /> : null}

      <Card title="Avance">
        <Text style={[typography.h1, styles.title]}>{project.progressPct}%</Text>
        <ProgressBar progreso={project.progressPct} />
      </Card>

      <Card title="Cronograma">
        {project.phases.length === 0 ? <Notice text="Sin fases definidas." /> : null}
        {project.phases.map((phase) => (
          <View key={phase.key} style={styles.item}>
            <View style={styles.itemHeader}>
              <Text style={[typography.body, styles.itemTitle]}>{phase.name}</Text>
              <StatusBadge label={PHASE_STATUS_LABEL[phase.status]} tone={stepStatusTone[phase.status]} />
            </View>
            <Text style={[typography.bodySmall, styles.muted]}>
              {formatDate(phase.plannedStart)} – {formatDate(phase.plannedEnd)}
            </Text>
          </View>
        ))}
      </Card>

      <Card title="Certificación">
        <Text style={[typography.body, styles.text]}>
          {project.certification.type === 'none'
            ? 'Sin certificación objetivo.'
            : [project.certification.type, project.certification.level].filter(Boolean).join(' ')}
        </Text>
        {project.requirements.map((item) => (
          <View key={item.code} style={styles.item}>
            <View style={styles.itemHeader}>
              <Text style={[typography.body, styles.itemTitle]}>{item.title}</Text>
              <StatusBadge label={REQUIREMENT_STATUS_LABEL[item.status]} tone={stepStatusTone[item.status]} />
            </View>
            {item.note ? <Text style={[typography.bodySmall, styles.muted]}>{item.note}</Text> : null}
            {canUpdateRequirements ? (
              <TextLink
                label="Actualizar requisito"
                style={styles.link}
                onPress={() => {
                  setRequirement(item);
                  setSheet('requirement');
                }}
              />
            ) : null}
          </View>
        ))}
      </Card>

      <BudgetCard
        project={project}
        movements={canReadAmounts ? movements.items : []}
        hasMoreMovements={movements.items.length < movements.total}
        loadingMovements={movements.loading || movements.loadingMore}
        onMoreMovements={movements.loadMore}
        onAdjust={canAdjust ? () => openAdjustment(null) : undefined}
        onReverse={canAdjust ? openAdjustment : undefined}
      />

      <Card title="Impacto">
        <Row label="CO₂ evitado" value={`${formatNumber(project.impact.co2TonsPerYear)} t/año`} />
        <Row label="Ahorro de energía" value={`${project.impact.energySavingPct}%`} />
        <Row label="Agua" value={`${formatNumber(project.impact.waterM3PerYear)} m³/año`} />
      </Card>

      <Text style={[typography.h3, styles.title]}>Actividad</Text>
      {activity.error ? <Notice text={activity.error} tone="error" /> : null}
    </View>
  );

  return (
    <View style={styles.screen}>
      {/* La actividad puede ser larga: es la lista virtualizada; las tarjetas van en su encabezado. */}
      <FlatList<ActivityEntry>
        data={activity.items}
        keyExtractor={(entry) => entry.id}
        contentContainerStyle={styles.content}
        ListHeaderComponent={header}
        refreshControl={<RefreshControl refreshing={detail.loading} onRefresh={refresh} />}
        onEndReached={activity.loadMore}
        onEndReachedThreshold={0.4}
        renderItem={({item}) => (
          <View style={styles.activity}>
            <Text style={[typography.body, styles.text]}>{item.summary}</Text>
            <Text style={[typography.bodySmall, styles.muted]}>
              {item.actorName} · {formatDate(item.at)}
            </Text>
          </View>
        )}
        ListFooterComponent={activity.loadingMore ? <ActivityIndicator color={colors.ink} /> : null}
        ListEmptyComponent={activity.loading ? null : <Notice text="Sin actividad registrada." />}
      />

      <ActionMenu visible={sheet === 'menu'} title={project.name} actions={menu} onClose={() => setSheet(null)} />
      <ArchiveSheet visible={sheet === 'archive'} project={project} onClose={() => setSheet(null)} />
      <DeleteSheet
        visible={sheet === 'delete'}
        project={project}
        deletable={project.deletable}
        canArchive={canArchive && !project.archivedAt}
        onClose={() => setSheet(null)}
        onDeleted={() => navigation.goBack()}
        onArchive={() => setSheet('archive')}
      />
      <AdjustmentSheet visible={sheet === 'adjustment'} projectId={project.id} reversing={reversing} onClose={() => setSheet(null)} />
      <RequirementSheet visible={sheet === 'requirement'} projectId={project.id} requirement={requirement} onClose={() => setSheet(null)} />
    </View>
  );
}

interface BudgetCardProps {
  project: Project;
  movements: BudgetMovement[];
  hasMoreMovements: boolean;
  loadingMovements: boolean;
  onMoreMovements: () => void;
  onAdjust?: () => void;
  onReverse?: (movement: BudgetMovement) => void;
}

/** Sin montos en la respuesta, solo el porcentaje; con montos, cifras exactas, ajustes y movimientos. */
function BudgetCard({
  project,
  movements,
  hasMoreMovements,
  loadingMovements,
  onMoreMovements,
  onAdjust,
  onReverse,
}: BudgetCardProps): React.ReactElement {
  const {budget} = project;
  return (
    <Card title="Presupuesto">
      <Text style={[typography.h1, styles.title]}>{budget.spentPct}%</Text>
      <ProgressBar progreso={budget.spentPct} />
      <Text style={[typography.bodySmall, styles.muted]}>del presupuesto ejercido</Text>

      {budgetHasAmounts(budget) ? (
        <>
          <Row label="Presupuesto vigente" value={formatMoney(budget.currentBudget)} />
          <Row label="Ejercido" value={formatMoney(budget.spent)} />
          <Row label="Disponible" value={formatMoney(budget.available)} />
        </>
      ) : null}

      {onAdjust ? <PrimaryButton label="Registrar ajuste" onPress={onAdjust} /> : null}

      {movements.length > 0 ? <Text style={[typography.label, styles.muted]}>MOVIMIENTOS</Text> : null}
      {movements.map((movement) => (
        <View key={movement.id} style={styles.item}>
          <View style={styles.itemHeader}>
            <Text style={[typography.body, styles.itemTitle]}>
              {movement.folio} · {BUDGET_MOVEMENT_KIND_LABEL[movement.kind]}
            </Text>
            <Text style={[typography.h3, styles.text]}>{formatMoney(movement.amount)}</Text>
          </View>
          <Text style={[typography.bodySmall, styles.muted]}>
            {formatDate(movement.createdAt)} · {movement.reason}
          </Text>
          {movement.reversed ? <Text style={[typography.bodySmall, styles.muted]}>Ya corregido.</Text> : null}
          {onReverse && movement.kind === 'adjustment' && !movement.reversed ? (
            <TextLink label="Corregir" style={styles.link} onPress={() => onReverse(movement)} />
          ) : null}
        </View>
      ))}
      {hasMoreMovements ? (
        <TextLink label="Ver más movimientos" onPress={onMoreMovements} disabled={loadingMovements} style={styles.link} />
      ) : null}
    </Card>
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
  content: {padding: 20, paddingBottom: 32, gap: 10},
  cards: {gap: 14, marginBottom: 4},
  header: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8},
  headerText: {flex: 1, gap: 4},
  badges: {flexDirection: 'row', gap: 8, flexWrap: 'wrap'},
  title: {color: colors.ink, flexShrink: 1},
  text: {color: colors.ink},
  muted: {color: colors.inkSecondary},
  item: {gap: 4, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.line},
  itemHeader: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8},
  itemTitle: {color: colors.ink, fontWeight: '600', flexShrink: 1},
  link: {alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center'},
  row: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8},
  activity: {
    gap: 2,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    padding: 12,
  },
});
