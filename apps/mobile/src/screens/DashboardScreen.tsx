import React, {useMemo} from 'react';
import {ScrollView, StyleSheet, Text, View} from 'react-native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {useNavigation} from '@react-navigation/native';
import {colors} from '../theme/colors';
import {typography} from '../theme/typography';
import {useAuth} from '../state/AuthContext';
import {useObras} from '../state/ObrasContext';
import {ObraCard} from '../components/ObraCard';
import type {RootStackParamList} from '../navigation/RootNavigator';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function DashboardScreen(): React.ReactElement {
  const {user} = useAuth();
  const {obras} = useObras();
  const navigation = useNavigation<Nav>();

  const kpis = useMemo(() => {
    const activas = obras.filter((o) => o.estado !== 'completada');
    const certificando = obras.filter((o) => o.estado === 'certificando');
    const retrasadas = obras.filter((o) => o.estado === 'retrasada');
    const promedio = obras.length
      ? Math.round(obras.reduce((sum, o) => sum + o.progreso, 0) / obras.length)
      : 0;
    return {
      activas: activas.length,
      certificando: certificando.length,
      retrasadas: retrasadas.length,
      promedio,
    };
  }, [obras]);

  const enCurso = useMemo(() => obras.filter((o) => o.estado !== 'completada').slice(0, 3), [obras]);
  const certificaciones = useMemo(() => obras.filter((o) => o.certificacion), [obras]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={[typography.bodySmall, styles.greeting]}>Hola, {user?.nombre ?? 'invitado'}</Text>
      <Text style={[typography.h1, styles.title]}>Resumen de obras</Text>

      <View style={styles.kpiGrid}>
        <KpiTile label="Obras activas" value={String(kpis.activas)} />
        <KpiTile label="Certificando" value={String(kpis.certificando)} />
        <KpiTile label="Retrasadas" value={String(kpis.retrasadas)} accent={colors.terracota} />
        <KpiTile label="Avance promedio" value={`${kpis.promedio}%`} accent={colors.exito} />
      </View>

      <Text style={[typography.h2, styles.sectionTitle]}>Obras en curso</Text>
      <View style={styles.list}>
        {enCurso.map((obra) => (
          <ObraCard
            key={obra.id}
            obra={obra}
            onPress={() => navigation.navigate('ObraDetail', {obraId: obra.id})}
          />
        ))}
      </View>

      <Text style={[typography.h2, styles.sectionTitle]}>Certificaciones</Text>
      <View style={styles.list}>
        {certificaciones.map((obra) => (
          <ObraCard
            key={obra.id}
            obra={obra}
            onPress={() => navigation.navigate('ObraDetail', {obraId: obra.id})}
          />
        ))}
        {certificaciones.length === 0 ? (
          <Text style={[typography.body, styles.empty]}>Sin certificaciones en curso.</Text>
        ) : null}
      </View>
    </ScrollView>
  );
}

function KpiTile({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}): React.ReactElement {
  return (
    <View style={styles.kpiTile}>
      <Text style={[typography.h1, styles.kpiValue, accent ? {color: accent} : null]}>{value}</Text>
      <Text style={[typography.bodySmall, styles.kpiLabel]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.hueso,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
    gap: 12,
  },
  greeting: {
    color: colors.piedra,
  },
  title: {
    color: colors.negro,
    marginBottom: 8,
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 8,
  },
  kpiTile: {
    flexBasis: '47%',
    backgroundColor: colors.blanco,
    borderWidth: 1,
    borderColor: colors.linea,
    borderRadius: 12,
    padding: 14,
  },
  kpiValue: {
    color: colors.negro,
  },
  kpiLabel: {
    color: colors.piedra,
    marginTop: 4,
  },
  sectionTitle: {
    color: colors.negro,
    marginTop: 8,
  },
  list: {
    gap: 10,
  },
  empty: {
    color: colors.piedra,
  },
});
