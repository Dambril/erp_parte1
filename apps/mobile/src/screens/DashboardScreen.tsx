import React, {useMemo} from 'react';
import {RefreshControl, ScrollView, StyleSheet, Text, View} from 'react-native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {useNavigation} from '@react-navigation/native';
import {CERTIFICACION_ESTADO_LABEL, calcularResumen, formatearMonto, formatearNumero} from '@erp/domain';
import {colors} from '../theme/colors';
import {typography} from '../theme/typography';
import {useAuth} from '../state/AuthContext';
import {useObras} from '../state/ObrasContext';
import {ObraCard} from '../components/ObraCard';
import {ConexionBadge} from '../components/ConexionBadge';
import {ProgressBar} from '../components/ProgressBar';
import type {RootStackParamList} from '../navigation/RootNavigator';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function DashboardScreen(): React.ReactElement {
  const {user} = useAuth();
  const {obras, cargando, error, conexion, store} = useObras();
  const navigation = useNavigation<Nav>();

  const resumen = useMemo(() => calcularResumen(obras), [obras]);
  const presupuesto = resumen.presupuesto[0];
  const enCurso = useMemo(
    () => obras.filter((o) => o.etapa === 'ejecucion' || o.etapa === 'certificacion').slice(0, 3),
    [obras],
  );
  const abrir = (obraId: string) => navigation.navigate('ObraDetail', {obraId});

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={cargando} onRefresh={() => store.refrescar()} />}>
      <View style={styles.topRow}>
        <Text style={[typography.bodySmall, styles.muted]}>Hola, {user?.name ?? ''}</Text>
        <ConexionBadge estado={conexion} />
      </View>
      <Text style={[typography.h1, styles.title]}>Resumen de obras</Text>
      {error ? <Text style={[typography.bodySmall, styles.error]}>{error}</Text> : null}

      <View style={styles.kpiGrid}>
        <KpiTile label="Obras activas" value={String(resumen.activas)} />
        <KpiTile label="Avance promedio" value={`${resumen.avancePromedio}%`} accent={colors.exito} />
        <KpiTile label="Retrasadas" value={String(resumen.retrasadas)} accent={colors.terracota} />
        <KpiTile label="Certificando" value={String(resumen.certificando)} />
      </View>

      <View style={[styles.card, styles.darkCard]}>
        <Text style={[typography.label, styles.darkLabel]}>CO₂ EVITADO ACUMULADO (MEDIDO)</Text>
        <Text style={[typography.h1, styles.lima]}>
          {formatearNumero(resumen.impactoMedido.co2EvitadoKg / 1000, 1)} t
        </Text>
        <Text style={[typography.bodySmall, styles.darkLabel]}>
          {formatearNumero(resumen.impactoMedido.energiaAhorradaKwh)} kWh ahorrados ·{' '}
          {formatearNumero(resumen.impactoMedido.aguaCaptadaM3)} m³ de agua captada
        </Text>
      </View>

      {presupuesto ? (
        <View style={styles.card}>
          <Text style={[typography.label, styles.muted]}>PRESUPUESTO EJERCIDO</Text>
          <Text style={[typography.h2, styles.title]}>{presupuesto.porcentajeEjercido}%</Text>
          <ProgressBar progreso={presupuesto.porcentajeEjercido} />
          <Text style={[typography.bodySmall, styles.muted]}>
            {formatearMonto(presupuesto.ejercido, presupuesto.moneda)} de{' '}
            {formatearMonto(presupuesto.total, presupuesto.moneda)}
          </Text>
        </View>
      ) : null}

      <Text style={[typography.h2, styles.sectionTitle]}>Obras en curso</Text>
      <View style={styles.list}>
        {enCurso.map((obra) => (
          <ObraCard key={obra.id} obra={obra} onPress={() => abrir(obra.id)} />
        ))}
        {!cargando && enCurso.length === 0 ? (
          <Text style={[typography.body, styles.muted]}>No hay obras en curso.</Text>
        ) : null}
      </View>

      <Text style={[typography.h2, styles.sectionTitle]}>Certificaciones en curso</Text>
      <View style={styles.list}>
        {resumen.certificacionesEnCurso.map((cert) => (
          <Text
            key={cert.obraId}
            style={[typography.body, styles.certRow]}
            onPress={() => abrir(cert.obraId)}>
            <Text style={styles.certTipo}>
              {cert.tipo} {cert.nivelObjetivo}
            </Text>
            {'  '}
            {cert.obraNombre} · {CERTIFICACION_ESTADO_LABEL[cert.estado]}
          </Text>
        ))}
        {resumen.certificacionesEnCurso.length === 0 ? (
          <Text style={[typography.body, styles.muted]}>Sin certificaciones en curso.</Text>
        ) : null}
      </View>
    </ScrollView>
  );
}

function KpiTile({label, value, accent}: {label: string; value: string; accent?: string}): React.ReactElement {
  return (
    <View style={styles.kpiTile}>
      <Text style={[typography.h1, styles.title, accent ? {color: accent} : null]}>{value}</Text>
      <Text style={[typography.bodySmall, styles.muted]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.hueso},
  content: {padding: 20, paddingBottom: 40, gap: 12},
  topRow: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'},
  muted: {color: colors.piedra},
  title: {color: colors.negro},
  error: {color: colors.terracota},
  kpiGrid: {flexDirection: 'row', flexWrap: 'wrap', gap: 12},
  kpiTile: {
    flexBasis: '47%',
    backgroundColor: colors.blanco,
    borderWidth: 1,
    borderColor: colors.linea,
    borderRadius: 12,
    padding: 14,
    gap: 4,
  },
  card: {
    backgroundColor: colors.blanco,
    borderWidth: 1,
    borderColor: colors.linea,
    borderRadius: 12,
    padding: 16,
    gap: 6,
  },
  darkCard: {backgroundColor: colors.verdeBosque, borderColor: colors.verdeBosque},
  darkLabel: {color: '#C9D6CD'},
  lima: {color: colors.lima},
  sectionTitle: {color: colors.negro, marginTop: 8},
  list: {gap: 10},
  certRow: {
    color: colors.piedra,
    backgroundColor: colors.blanco,
    borderWidth: 1,
    borderColor: colors.linea,
    borderRadius: 12,
    padding: 14,
  },
  certTipo: {color: colors.verdeBosqueClaro, fontWeight: '700'},
});
