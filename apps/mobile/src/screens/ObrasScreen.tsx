import React, {useMemo, useState} from 'react';
import {FlatList, RefreshControl, StyleSheet, Text, TextInput, View} from 'react-native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {useNavigation} from '@react-navigation/native';
import {ObraEstadoSchema} from '@erp/domain';
import {colors, estadoLabel, type ObraEstado} from '../theme/colors';
import {typography} from '../theme/typography';
import {useObras} from '../state/ObrasContext';
import {ObraCard} from '../components/ObraCard';
import {FilterChip} from '../components/FilterChip';
import {ConexionBadge} from '../components/ConexionBadge';
import type {RootStackParamList} from '../navigation/RootNavigator';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type FiltroEstado = 'todas' | ObraEstado;

const FILTROS: {key: FiltroEstado; label: string}[] = [
  {key: 'todas', label: 'Todas'},
  ...ObraEstadoSchema.options.map((estado) => ({key: estado, label: estadoLabel[estado]})),
];

export function ObrasScreen(): React.ReactElement {
  const {obras, cargando, error, conexion, store} = useObras();
  const navigation = useNavigation<Nav>();
  const [query, setQuery] = useState('');
  const [filtro, setFiltro] = useState<FiltroEstado>('todas');

  const filtradas = useMemo(() => {
    const q = query.trim().toLowerCase();
    return obras.filter((obra) => {
      const coincideTexto =
        !q ||
        obra.nombre.toLowerCase().includes(q) ||
        obra.cliente.toLowerCase().includes(q) ||
        obra.ubicacion.toLowerCase().includes(q);
      return coincideTexto && (filtro === 'todas' || obra.estado === filtro);
    });
  }, [obras, query, filtro]);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={[typography.h1, styles.title]}>Obras</Text>
          <ConexionBadge estado={conexion} />
        </View>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Buscar por nombre, cliente o ciudad"
          placeholderTextColor={colors.piedra}
          style={styles.search}
        />
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={FILTROS}
          keyExtractor={(item) => item.key}
          contentContainerStyle={styles.chips}
          renderItem={({item}) => (
            <FilterChip label={item.label} active={filtro === item.key} onPress={() => setFiltro(item.key)} />
          )}
        />
        {error ? <Text style={[typography.bodySmall, styles.error]}>{error}</Text> : null}
      </View>

      <FlatList
        data={filtradas}
        keyExtractor={(obra) => obra.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={cargando} onRefresh={() => store.refrescar()} />}
        renderItem={({item}) => (
          <ObraCard obra={item} onPress={() => navigation.navigate('ObraDetail', {obraId: item.id})} />
        )}
        ListEmptyComponent={
          cargando ? null : (
            <Text style={[typography.body, styles.empty]}>
              {obras.length === 0 ? 'Todavía no hay obras registradas.' : 'No hay obras con ese filtro.'}
            </Text>
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.hueso},
  header: {padding: 20, paddingBottom: 8, gap: 12},
  titleRow: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'},
  title: {color: colors.negro},
  search: {
    borderWidth: 1,
    borderColor: colors.linea,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: colors.blanco,
    color: colors.negro,
  },
  chips: {gap: 8},
  error: {color: colors.terracota},
  list: {padding: 20, paddingTop: 8, gap: 10},
  empty: {color: colors.piedra, textAlign: 'center', marginTop: 24},
});
