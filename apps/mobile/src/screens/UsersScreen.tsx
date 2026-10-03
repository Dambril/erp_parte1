import React, {useState} from 'react';
import {ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {colors, radii} from '@erp/ui';
import {ROLE_LABEL, USER_STATUS_LABEL, UserStatusSchema, type PublicUser, type UserStatus} from '@erp/domain';
import {typography} from '../theme/typography';
import {roleTone, userStatusTone} from '../theme/users';
import {usePagedList} from '../hooks/useResource';
import {apiClient} from '../lib/apiClient';
import {Avatar} from '../components/Avatar';
import {Notice} from '../components/Card';
import {FilterChip} from '../components/FilterChip';
import {ListState, OfflineBanner} from '../components/ListStates';
import {PrimaryButton} from '../components/PrimaryButton';
import {SearchInput} from '../components/SearchInput';
import {StatusBadge} from '../components/StatusBadge';
import {InviteUserSheet} from '../sheets/InviteUserSheet';
import type {RootStackParamList} from '../navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'Users'>;
type Filter = 'all' | UserStatus;

const FILTERS: {key: Filter; label: string}[] = [
  {key: 'all', label: 'Todos'},
  ...UserStatusSchema.options.map((status) => ({key: status, label: USER_STATUS_LABEL[status]})),
];

export function UsersScreen({navigation}: Props): React.ReactElement {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [inviting, setInviting] = useState(false);
  const [notice, setNotice] = useState<{text: string; tone: 'muted' | 'error'} | null>(null);
  const list = usePagedList(
    (page) => apiClient.users.list({page, pageSize: 30, q: q || undefined, status: filter === 'all' ? undefined : filter}),
    `users:${filter}:${q}`,
  );

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <OfflineBanner />
        <PrimaryButton label="Invitar" onPress={() => setInviting(true)} />
        <SearchInput placeholder="Buscar por nombre o correo" onSearch={setQ} />
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={FILTERS}
          keyExtractor={(item) => item.key}
          contentContainerStyle={styles.chips}
          renderItem={({item}) => <FilterChip label={item.label} active={filter === item.key} onPress={() => setFilter(item.key)} />}
        />
        {notice ? <Notice text={notice.text} tone={notice.tone} /> : null}
        {list.error && list.items.length > 0 ? <Notice text={list.error} tone="error" /> : null}
      </View>

      <FlatList
        data={list.items}
        keyExtractor={(user) => user.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={list.loading && list.items.length > 0} onRefresh={list.reload} />}
        onEndReached={list.loadMore}
        onEndReachedThreshold={0.4}
        renderItem={({item}) => <UserRow user={item} onPress={() => navigation.navigate('UserDetail', {user: item})} />}
        ListFooterComponent={list.loadingMore ? <ActivityIndicator color={colors.ink} style={styles.footer} /> : null}
        ListEmptyComponent={
          <ListState
            loading={list.loading}
            error={list.error}
            query={q}
            onRetry={list.reload}
            empty={
              filter === 'all'
                ? {title: 'Aún no hay usuarios', text: 'Invita a tu equipo para que entre con su propio correo.'}
                : {title: `No hay usuarios con estado "${USER_STATUS_LABEL[filter]}"`}
            }
          />
        }
      />

      <InviteUserSheet
        visible={inviting}
        onClose={() => setInviting(false)}
        onInvited={({user, emailSent}) => {
          setInviting(false);
          setNotice(
            emailSent
              ? {text: `Invitación enviada a ${user.email}.`, tone: 'muted'}
              : {text: `Se creó la cuenta de ${user.email}, pero el correo no salió. Ábrela y usa "Reenviar invitación".`, tone: 'error'},
          );
        }}
      />
    </View>
  );
}

function UserRow({user, onPress}: {user: PublicUser; onPress: () => void}): React.ReactElement {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} accessibilityRole="button" activeOpacity={0.7}>
      <Avatar name={user.name} />
      <View style={styles.rowText}>
        <Text style={[typography.h3, styles.name]} numberOfLines={1}>
          {user.name}
        </Text>
        <Text style={[typography.bodySmall, styles.muted]} numberOfLines={1}>
          {user.email}
        </Text>
        <View style={styles.badges}>
          <StatusBadge label={ROLE_LABEL[user.role]} tone={roleTone(user.role)} />
          <StatusBadge label={USER_STATUS_LABEL[user.status]} tone={userStatusTone[user.status]} />
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.bone},
  header: {padding: 20, paddingBottom: 8, gap: 12},
  chips: {gap: 8},
  list: {padding: 20, paddingTop: 8, gap: 10},
  footer: {marginVertical: 12},
  row: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    padding: 14,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.card,
  },
  rowText: {flex: 1, gap: 4},
  name: {color: colors.ink},
  muted: {color: colors.inkSecondary},
  badges: {flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 2},
});
