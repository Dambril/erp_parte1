import React, {useMemo, useState} from 'react';
import {FlatList, StyleSheet, Text, TextInput, View} from 'react-native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {useNavigation} from '@react-navigation/native';
import {colors, estadoLabel, type ObraEstado} from '../theme/colors';
import {typography} from '../theme/typography';
import {useObras} from '../state/ObrasContext';
import {ObraCard} from '../components/ObraCard';
import {FilterChip} from '../components/FilterChip';
import type {RootStackParamList} from '../navigation/RootNavigator';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type FiltroEstado = 'todas' | ObraEstado;

const FILTROS: {key: FiltroEstado; label: string}[] = [
  {key: 'todas', label: 'Todas'},
  {key: 'en_progreso', label: estadoLabel.en_progreso},
  {key: 'certificando', label: estadoLabel.certificando},
  {key: 'retrasada', label: estadoLabel.retrasada},
  {key: 'completada', label: estadoLabel.completada},
];

export function ObrasScreen(): React.ReactElement {
  const {obras} = useObras();
  const navigation = useNavigation<Nav>();
  const [query, setQuery] = useState('');
  const [filtro, setFiltro] = useState<FiltroEstado>('todas');

  const filtradas = useMemo(() => {
    const q = query.trim().toLowerCase();
    return obras.filter((obra) => {
      const coincideTexto =
        !q || obra.nombre.toLowerCase().includes(q) || obra.cliente.toLowerCase().includes(q);
      const coincideEstado = filtro === 'todas' || obra.estado === filtro;
      return coincideTexto && coincideEstado;
    });
  }, [obras, query, filtro]);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={[typography.h1, styles.title]}>Obras</Text>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Buscar por nombre o cliente"
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
            <FilterChip
              label={item.label}
              active={filtro === item.key}
              onPress={() => setFiltro(item.key)}
            />
          )}
        />
      </View>

      <FlatList
        data={filtradas}
        keyExtractor={(obra) => obra.id}
        contentContainerStyle={styles.list}
        renderItem={({item}) => (
          <ObraCard obra={item} onPress={() => navigation.navigate('ObraDetail', {obraId: item.id})} />
        )}
        ListEmptyComponent={
          <Text style={[typography.body, styles.empty]}>No hay obras con ese filtro.</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.hueso,
  },
  header: {
    padding: 20,
    paddingBottom: 8,
    gap: 12,
  },
  title: {
    color: colors.negro,
  },
  search: {
    borderWidth: 1,
    borderColor: colors.linea,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: colors.blanco,
    color: colors.negro,
  },
  chips: {
    gap: 8,
  },
  list: {
    padding: 20,
    paddingTop: 8,
    gap: 10,
  },
  empty: {
    color: colors.piedra,
    textAlign: 'center',
    marginTop: 24,
  },
});
