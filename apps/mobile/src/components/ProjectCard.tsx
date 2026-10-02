import React from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {colors, radii} from '@erp/ui';
import {formatDate, PROJECT_STATUS_LABEL, type ProjectListItem} from '@erp/domain';
import {typography} from '../theme/typography';
import {projectStatusTone} from '../theme/status';
import {MoreButton} from './ActionMenu';
import {ProgressBar} from './ProgressBar';
import {StatusBadge} from './StatusBadge';

interface Props {
  project: ProjectListItem;
  onPress: () => void;
  /** Si se indica, la tarjeta muestra el menú "⋯". */
  onMore?: () => void;
}

export function ProjectCard({project, onPress, onMore}: Props): React.ReactElement {
  const {certification} = project;
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7} accessibilityRole="button">
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={[typography.h3, styles.name]} numberOfLines={1}>
            {project.name}
          </Text>
          <Text style={[typography.bodySmall, styles.muted]} numberOfLines={1}>
            {project.client.name} · {project.location}
          </Text>
        </View>
        {onMore ? <MoreButton onPress={onMore} label={`Acciones de ${project.name}`} /> : null}
      </View>
      <View style={styles.badges}>
        <StatusBadge label={PROJECT_STATUS_LABEL[project.status]} tone={projectStatusTone[project.status]} />
        {project.delayDays > 0 ? (
          <Text style={[typography.bodySmall, styles.delay]}>Retraso de {project.delayDays} días</Text>
        ) : null}
      </View>
      <ProgressBar progreso={project.progressPct} />
      <View style={styles.footer}>
        <Text style={[typography.bodySmall, styles.muted]}>{project.progressPct}% de avance</Text>
        <Text style={[typography.bodySmall, styles.muted]}>
          {certification.type === 'none' ? 'Sin certificación' : [certification.type, certification.level].filter(Boolean).join(' ')}
        </Text>
      </View>
      <Text style={[typography.bodySmall, styles.muted]}>
        {project.deliveryDate ? `Entrega: ${formatDate(project.deliveryDate)}` : 'Entrega sin definir'}
      </Text>
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
    gap: 10,
  },
  header: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8},
  headerText: {flex: 1, gap: 2},
  name: {color: colors.ink},
  muted: {color: colors.inkSecondary},
  badges: {flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap'},
  delay: {color: colors.ink, fontWeight: '600'},
  footer: {flexDirection: 'row', justifyContent: 'space-between', gap: 8},
});
