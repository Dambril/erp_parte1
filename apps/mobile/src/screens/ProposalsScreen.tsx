import React, {useState} from 'react';
import {ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View} from 'react-native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {useNavigation} from '@react-navigation/native';
import {colors} from '@erp/ui';
import type {ProposalStatus} from '@erp/domain';
import {typography} from '../theme/typography';
import {usePagedList} from '../hooks/useResource';
import {apiClient} from '../lib/apiClient';
import {Notice} from '../components/Card';
import {FilterChip} from '../components/FilterChip';
import {ProposalCard} from '../components/ProposalCard';
import type {RootStackParamList} from '../navigation/RootNavigator';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const FILTERS: {key: ProposalStatus; label: string}[] = [
  {key: 'in_review', label: 'En revisión'},
  {key: 'draft', label: 'Borradores'},
  {key: 'approved', label: 'Aprobadas'},
  {key: 'rejected', label: 'Rechazadas'},
];

export function ProposalsScreen(): React.ReactElement {
  const navigation = useNavigation<Nav>();
  const [status, setStatus] = useState<ProposalStatus>('in_review');
  const list = usePagedList((page) => apiClient.construction.proposals.list({page, pageSize: 20, status}), `proposals:${status}`);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={[typography.h1, styles.title]}>Propuestas</Text>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={FILTERS}
          keyExtractor={(item) => item.key}
          contentContainerStyle={styles.chips}
          renderItem={({item}) => (
            <FilterChip label={item.label} active={status === item.key} onPress={() => setStatus(item.key)} />
          )}
        />
        {list.error ? <Notice text={list.error} tone="error" /> : null}
      </View>

      <FlatList
        data={list.items}
        keyExtractor={(proposal) => proposal.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={list.loading} onRefresh={list.reload} />}
        onEndReached={list.loadMore}
        onEndReachedThreshold={0.4}
        renderItem={({item}) => (
          <ProposalCard proposal={item} onPress={() => navigation.navigate('ProposalDetail', {proposalId: item.id})} />
        )}
        ListFooterComponent={list.loadingMore ? <ActivityIndicator color={colors.ink} style={styles.footer} /> : null}
        ListEmptyComponent={
          list.loading ? null : <Text style={[typography.body, styles.empty]}>No hay propuestas en este estado.</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.bone},
  header: {padding: 20, paddingBottom: 8, gap: 12},
  title: {color: colors.ink},
  chips: {gap: 8},
  list: {padding: 20, paddingTop: 8, gap: 10},
  footer: {marginVertical: 12},
  empty: {color: colors.inkSecondary, textAlign: 'center', marginTop: 24},
});
