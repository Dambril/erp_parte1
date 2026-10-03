import React, {useState} from 'react';
import {ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View} from 'react-native';
import {colors, radii} from '@erp/ui';
import {formatDate, type TrashItem} from '@erp/domain';
import {mensajeError} from '@erp/api-client';
import {typography} from '../theme/typography';
import {tones} from '../theme/status';
import {useAuth} from '../state/AuthContext';
import {useConstruction} from '../state/ConstructionContext';
import {usePagedList} from '../hooks/useResource';
import {apiClient} from '../lib/apiClient';
import {Notice} from '../components/Card';
import {ListState, OfflineBanner} from '../components/ListStates';
import {PrimaryButton} from '../components/PrimaryButton';
import {StatusBadge} from '../components/StatusBadge';

const KIND_LABEL: Record<TrashItem['kind'], string> = {project: 'Obra', proposal: 'Propuesta'};

/** Obras y propuestas eliminadas. Restaurar las devuelve tal como estaban. */
export function TrashScreen(): React.ReactElement {
  const {can} = useAuth();
  const {refresh} = useConstruction();
  const [restoring, setRestoring] = useState<string | null>(null);
  const [notice, setNotice] = useState<{text: string; tone: 'muted' | 'error'} | null>(null);
  const list = usePagedList((page) => apiClient.construction.trash({page, pageSize: 30}), 'trash');

  const restore = async (item: TrashItem) => {
    setNotice(null);
    setRestoring(item.id);
    try {
      if (item.kind === 'project') await apiClient.construction.projects.restore(item.id);
      else await apiClient.construction.proposals.restore(item.id);
      refresh();
      setNotice({text: `Se restauró ${item.name}. Ya aparece en ${item.kind === 'project' ? 'Obras' : 'Propuestas'}.`, tone: 'muted'});
    } catch (error) {
      setNotice({text: mensajeError(error), tone: 'error'});
    } finally {
      setRestoring(null);
    }
  };

  const canRestore = (item: TrashItem) =>
    can(item.kind === 'project' ? 'construction.projects:restore' : 'construction.proposals:restore');

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <OfflineBanner />
        {notice ? <Notice text={notice.text} tone={notice.tone} /> : null}
        {list.error && list.items.length > 0 ? <Notice text={list.error} tone="error" /> : null}
      </View>
      <FlatList
        data={list.items}
        keyExtractor={(item) => `${item.kind}:${item.id}`}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={list.loading && list.items.length > 0} onRefresh={list.reload} />}
        onEndReached={list.loadMore}
        onEndReachedThreshold={0.4}
        renderItem={({item}) => (
          <View style={styles.row}>
            <View style={styles.rowHeader}>
              <StatusBadge label={KIND_LABEL[item.kind]} tone={item.kind === 'project' ? tones.forest : tones.neutral} />
              <Text style={[typography.bodySmall, styles.muted]}>{item.folio}</Text>
            </View>
            <Text style={[typography.h3, styles.name]}>{item.name}</Text>
            <Text style={[typography.bodySmall, styles.muted]}>
              Eliminada el {formatDate(item.deletedAt)}
              {item.deletedBy ? ` por ${item.deletedBy.name}` : ''}
            </Text>
            {canRestore(item) ? (
              <PrimaryButton
                label="Restaurar"
                variant="secondary"
                onPress={() => void restore(item)}
                loading={restoring === item.id}
                disabled={restoring !== null && restoring !== item.id}
              />
            ) : null}
          </View>
        )}
        ListFooterComponent={list.loadingMore ? <ActivityIndicator color={colors.ink} style={styles.footer} /> : null}
        ListEmptyComponent={
          <ListState
            loading={list.loading}
            error={list.error}
            onRetry={list.reload}
            empty={{title: 'La papelera está vacía', text: 'Aquí aparecen las obras y propuestas que se eliminen.'}}
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.bone},
  header: {paddingHorizontal: 20, paddingTop: 16, gap: 12},
  list: {padding: 20, paddingTop: 12, gap: 10},
  footer: {marginVertical: 12},
  row: {
    padding: 14,
    gap: 8,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.card,
  },
  rowHeader: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8},
  name: {color: colors.ink},
  muted: {color: colors.inkSecondary},
});
