import React, {useEffect, useState} from 'react';
import {ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TextInput, View} from 'react-native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {useNavigation} from '@react-navigation/native';
import {colors, radii, touchTarget} from '@erp/ui';
import {PROJECT_STATUS_LABEL, ProjectStatusSchema, type ProjectListItem, type ProjectStatus} from '@erp/domain';
import {mensajeError} from '@erp/api-client';
import {typography} from '../theme/typography';
import {useAuth} from '../state/AuthContext';
import {useConstruction} from '../state/ConstructionContext';
import {usePagedList} from '../hooks/useResource';
import {apiClient} from '../lib/apiClient';
import {ActionMenu, type MenuAction} from '../components/ActionMenu';
import {Notice} from '../components/Card';
import {FilterChip} from '../components/FilterChip';
import {ProjectCard} from '../components/ProjectCard';
import {ArchiveSheet} from '../sheets/ProjectSheets';
import type {RootStackParamList} from '../navigation/RootNavigator';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Filter = 'all' | ProjectStatus | 'archived';

const PAGE_SIZE = 20;

export function ProjectsScreen(): React.ReactElement {
  const {can} = useAuth();
  const {refresh} = useConstruction();
  const navigation = useNavigation<Nav>();
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [menuFor, setMenuFor] = useState<ProjectListItem | null>(null);
  const [archiving, setArchiving] = useState<ProjectListItem | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // La búsqueda la hace la API: se espera a que la persona deje de escribir.
  useEffect(() => {
    const timer = setTimeout(() => setQ(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search]);

  const canArchive = can('construction.projects:archive');
  const canUpdate = can('construction.projects:update');
  const filters: {key: Filter; label: string}[] = [
    {key: 'all', label: 'Todas'},
    ...ProjectStatusSchema.options.map((status) => ({key: status, label: PROJECT_STATUS_LABEL[status]})),
    ...(canArchive ? [{key: 'archived' as const, label: 'Archivadas'}] : []),
  ];

  const list = usePagedList(
    (page) =>
      apiClient.construction.projects.list({
        page,
        pageSize: PAGE_SIZE,
        q: q || undefined,
        status: filter === 'all' || filter === 'archived' ? undefined : filter,
        archived: filter === 'archived' ? 'true' : undefined,
      }),
    `projects:${filter}:${q}`,
  );

  const unarchive = async (project: ProjectListItem) => {
    setActionError(null);
    try {
      await apiClient.construction.projects.unarchive(project.id);
      refresh();
    } catch (err) {
      setActionError(mensajeError(err));
    }
  };

  const actionsFor = (project: ProjectListItem): MenuAction[] => [
    ...(canUpdate ? [{label: 'Editar', onPress: () => navigation.navigate('ProjectEdit', {projectId: project.id})}] : []),
    project.archivedAt
      ? {label: 'Desarchivar', onPress: () => void unarchive(project)}
      : {label: 'Archivar', onPress: () => setArchiving(project)},
  ];

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={[typography.h1, styles.title]}>Obras</Text>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Buscar por nombre o cliente"
          placeholderTextColor={colors.stone}
          accessibilityLabel="Buscar obras"
          style={styles.search}
        />
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={filters}
          keyExtractor={(item) => item.key}
          contentContainerStyle={styles.chips}
          renderItem={({item}) => (
            <FilterChip label={item.label} active={filter === item.key} onPress={() => setFilter(item.key)} />
          )}
        />
        {list.error || actionError ? <Notice text={(list.error || actionError)!} tone="error" /> : null}
      </View>

      <FlatList
        data={list.items}
        keyExtractor={(project) => project.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={list.loading} onRefresh={list.reload} />}
        onEndReached={list.loadMore}
        onEndReachedThreshold={0.4}
        renderItem={({item}) => (
          <ProjectCard
            project={item}
            onPress={() => navigation.navigate('ProjectDetail', {projectId: item.id})}
            onMore={canArchive ? () => setMenuFor(item) : undefined}
          />
        )}
        ListFooterComponent={list.loadingMore ? <ActivityIndicator color={colors.ink} style={styles.footer} /> : null}
        ListEmptyComponent={
          list.loading ? null : (
            <Text style={[typography.body, styles.empty]}>
              {filter === 'archived' ? 'No hay obras archivadas.' : 'No hay obras con ese filtro.'}
            </Text>
          )
        }
      />

      <ActionMenu
        visible={menuFor !== null}
        title={menuFor?.name ?? ''}
        actions={menuFor ? actionsFor(menuFor) : []}
        onClose={() => setMenuFor(null)}
      />
      <ArchiveSheet
        visible={archiving !== null}
        project={archiving ?? {id: '', name: ''}}
        onClose={() => setArchiving(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.bone},
  header: {padding: 20, paddingBottom: 8, gap: 12},
  title: {color: colors.ink},
  search: {
    minHeight: touchTarget,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.input,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: colors.white,
    color: colors.ink,
  },
  chips: {gap: 8},
  list: {padding: 20, paddingTop: 8, gap: 10},
  footer: {marginVertical: 12},
  empty: {color: colors.inkSecondary, textAlign: 'center', marginTop: 24},
});
