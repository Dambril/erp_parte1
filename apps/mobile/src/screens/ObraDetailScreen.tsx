import React, {useState} from 'react';
import {ScrollView, StyleSheet, Text, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {colors} from '../theme/colors';
import {typography} from '../theme/typography';
import {useObras} from '../state/ObrasContext';
import {StatusBadge} from '../components/StatusBadge';
import {ProgressBar} from '../components/ProgressBar';
import {PrimaryButton} from '../components/PrimaryButton';
import type {RootStackParamList} from '../navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'ObraDetail'>;

export function ObraDetailScreen({route}: Props): React.ReactElement {
  const {obraId} = route.params;
  const {getObra, aprobarObra, solicitarCambios} = useObras();
  const obra = getObra(obraId);
  const [confirmacion, setConfirmacion] = useState<string | null>(null);

  if (!obra) {
    return (
      <View style={styles.screen}>
        <Text style={typography.body}>No se encontró la obra.</Text>
      </View>
    );
  }

  const yaCompletada = obra.estado === 'completada';

  const handleAprobar = () => {
    aprobarObra(obra.id);
    setConfirmacion(
      obra.estado === 'certificando'
        ? 'Obra certificada y marcada como completada.'
        : 'Propuesta aprobada: la obra pasa a certificación.',
    );
  };

  const handleSolicitarCambios = () => {
    solicitarCambios(obra.id);
    setConfirmacion('Se solicitaron cambios: la obra vuelve a "En progreso".');
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={[typography.h1, styles.title]}>{obra.nombre}</Text>
          <StatusBadge estado={obra.estado} />
        </View>
        <Text style={[typography.body, styles.cliente]}>
          {obra.cliente} · {obra.ubicacion}
        </Text>

        <View style={styles.progressBlock}>
          <ProgressBar progreso={obra.progreso} />
          <Text style={[typography.bodySmall, styles.progressLabel]}>{obra.progreso}% de avance</Text>
        </View>

        <Section title="Alcance" text={obra.alcance} />
        <Section title="Impacto ambiental" text={obra.impactoAmbiental} />
        <Section title="Materiales" text={obra.materiales.join(', ')} />
        <Section title="Presupuesto" text={obra.presupuesto} />
        {obra.certificacion ? <Section title="Certificación" text={obra.certificacion} /> : null}
        <Section title="Cronograma" text={obra.cronograma} />

        {confirmacion ? <Text style={[typography.bodySmall, styles.confirmacion]}>{confirmacion}</Text> : null}
      </ScrollView>

      <View style={styles.actions}>
        <PrimaryButton
          label="Solicitar cambios"
          variant="secondary"
          onPress={handleSolicitarCambios}
          disabled={obra.estado === 'en_progreso'}
          style={styles.actionButton}
        />
        <PrimaryButton
          label={yaCompletada ? 'Completada' : 'Aprobar'}
          onPress={handleAprobar}
          disabled={yaCompletada}
          style={styles.actionButton}
        />
      </View>
    </View>
  );
}

function Section({title, text}: {title: string; text: string}): React.ReactElement {
  return (
    <View style={styles.section}>
      <Text style={[typography.h3, styles.sectionTitle]}>{title}</Text>
      <Text style={[typography.body, styles.sectionText]}>{text}</Text>
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
    paddingBottom: 16,
    gap: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  title: {
    flex: 1,
    color: colors.negro,
  },
  cliente: {
    color: colors.piedra,
  },
  progressBlock: {
    gap: 6,
  },
  progressLabel: {
    color: colors.piedra,
  },
  section: {
    gap: 4,
  },
  sectionTitle: {
    color: colors.negro,
  },
  sectionText: {
    color: colors.piedra,
  },
  confirmacion: {
    color: colors.verdeBosqueClaro,
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: colors.linea,
    backgroundColor: colors.blanco,
  },
  actionButton: {
    flex: 1,
  },
});
