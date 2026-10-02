import React, {useState} from 'react';
import {ScrollView, StyleSheet, Text, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {mensajeError} from '@erp/api-client';
import {
  CERTIFICACION_ESTADO_LABEL, etiquetaAprobar, faseRetrasada, fechaLocalISO, formatearFecha, formatearMonto,
  formatearNumero, hoyISO, porcentajeMonto, type Obra,
} from '@erp/domain';
import {colors} from '../theme/colors';
import {typography} from '../theme/typography';
import {useAuth} from '../state/AuthContext';
import {useObras} from '../state/ObrasContext';
import {StatusBadge} from '../components/StatusBadge';
import {ProgressBar} from '../components/ProgressBar';
import {PrimaryButton} from '../components/PrimaryButton';
import {TextField} from '../components/TextField';
import type {RootStackParamList} from '../navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'ObraDetail'>;
type Panel = 'ninguno' | 'cambios' | 'medicion';

export function ObraDetailScreen({route}: Props): React.ReactElement {
  const {can} = useAuth();
  const {obras, store} = useObras();
  const obra = obras.find((o) => o.id === route.params.obraId);
  const [panel, setPanel] = useState<Panel>('ninguno');
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState<{texto: string; error: boolean} | null>(null);

  if (!obra) {
    return (
      <View style={[styles.screen, styles.center]}>
        <Text style={[typography.body, styles.muted]}>La obra no existe o fue eliminada.</Text>
      </View>
    );
  }

  const puedeAprobar = can('obras.approve');
  const puedeMedir = can('obras.create');
  const etiqueta = etiquetaAprobar(obra.etapa);
  const puedeSolicitarCambios = obra.etapa === 'propuesta' || obra.etapa === 'certificacion';

  const ejecutar = async (accion: () => Promise<unknown>, exito: string) => {
    setEnviando(true);
    setMensaje(null);
    try {
      await accion();
      setPanel('ninguno');
      setMensaje({texto: exito, error: false});
    } catch (err) {
      setMensaje({texto: mensajeError(err), error: true});
    } finally {
      setEnviando(false);
    }
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={[typography.h1, styles.title]}>{obra.nombre}</Text>
          <StatusBadge estado={obra.estado} />
        </View>
        <Text style={[typography.body, styles.muted]}>
          {obra.cliente} · {obra.ubicacion}
        </Text>

        <View style={styles.block}>
          <ProgressBar progreso={obra.avance} />
          <Text style={[typography.bodySmall, styles.muted]}>{obra.avance}% de avance físico</Text>
        </View>

        {obra.alcance ? <Section title="Alcance"><Text style={[typography.body, styles.muted]}>{obra.alcance}</Text></Section> : null}

        <Section title="Presupuesto">
          <PresupuestoView obra={obra} />
        </Section>

        <Section title="Impacto ambiental">
          <ImpactoView obra={obra} />
        </Section>

        <Section title="Materiales y proveeduría">
          {obra.materiales.length === 0 ? <Text style={[typography.body, styles.muted]}>Sin materiales registrados.</Text> : null}
          {obra.materiales.map((material, index) => (
            <View key={`${material.nombre}-${index}`} style={styles.row}>
              <Text style={[typography.body, styles.title]}>{material.nombre}</Text>
              <Text style={[typography.bodySmall, styles.muted]}>
                {material.proveedor} · origen {material.origen}
                {material.distanciaKm !== null ? ` (${formatearNumero(material.distanciaKm)} km)` : ''}
                {material.certificacion ? ` · ${material.certificacion}` : ''}
              </Text>
            </View>
          ))}
        </Section>

        <Section title="Certificación">
          <Text style={[typography.body, styles.muted]}>
            {obra.certificacion
              ? `${obra.certificacion.tipo} ${obra.certificacion.nivelObjetivo} · ${CERTIFICACION_ESTADO_LABEL[obra.certificacion.estado]}`
              : 'Sin certificación objetivo.'}
          </Text>
        </Section>

        <Section title="Cronograma de fases">
          {obra.fases.length === 0 ? <Text style={[typography.body, styles.muted]}>Sin fases definidas.</Text> : null}
          {obra.fases.map((fase) => {
            const retrasada = obra.etapa === 'ejecucion' && faseRetrasada(fase, hoyISO());
            return (
              <View key={fase.id} style={styles.row}>
                <View style={styles.faseHeader}>
                  <Text style={[typography.body, styles.title]}>{fase.nombre}</Text>
                  <Text style={[typography.bodySmall, retrasada ? styles.alerta : styles.muted]}>
                    {retrasada ? 'Retrasada · ' : ''}
                    {fase.avance}%
                  </Text>
                </View>
                <ProgressBar progreso={fase.avance} />
                <Text style={[typography.bodySmall, styles.muted]}>
                  {formatearFecha(fase.inicio)} – {formatearFecha(fase.fin)}
                </Text>
              </View>
            );
          })}
        </Section>

        {obra.decisiones.length > 0 ? (
          <Section title="Historial de decisiones">
            {[...obra.decisiones].reverse().map((decision, index) => (
              <View key={`${decision.fecha}-${index}`} style={styles.row}>
                <Text style={[typography.body, styles.title]}>
                  {decision.accion === 'aprobada' ? 'Aprobada' : 'Cambios solicitados'} · {decision.autor.nombre}
                </Text>
                <Text style={[typography.bodySmall, styles.muted]}>
                  {formatearFecha(decision.fecha)}
                  {decision.comentario ? ` — ${decision.comentario}` : ''}
                </Text>
              </View>
            ))}
          </Section>
        ) : null}

        {panel === 'cambios' ? (
          <SolicitarCambiosForm
            enviando={enviando}
            onCancel={() => setPanel('ninguno')}
            onSubmit={(comentario) =>
              ejecutar(() => store.solicitarCambios(obra.id, comentario), 'Se solicitaron los cambios.')
            }
          />
        ) : null}
        {panel === 'medicion' ? (
          <MedicionForm
            enviando={enviando}
            onCancel={() => setPanel('ninguno')}
            onSubmit={(input) => ejecutar(() => store.registrarMedicion(obra.id, input), 'Medición registrada.')}
          />
        ) : null}

        {mensaje ? (
          <Text style={[typography.bodySmall, mensaje.error ? styles.alerta : styles.exito]}>{mensaje.texto}</Text>
        ) : null}
      </ScrollView>

      {panel === 'ninguno' && (puedeAprobar || puedeMedir) ? (
        <View style={styles.actions}>
          {puedeMedir && obra.etapa !== 'propuesta' ? (
            <PrimaryButton label="Medición" variant="secondary" onPress={() => setPanel('medicion')} style={styles.actionButton} />
          ) : null}
          {puedeAprobar && puedeSolicitarCambios ? (
            <PrimaryButton label="Solicitar cambios" variant="secondary" onPress={() => setPanel('cambios')} style={styles.actionButton} />
          ) : null}
          {puedeAprobar && etiqueta ? (
            <PrimaryButton
              label={etiqueta}
              loading={enviando}
              disabled={obra.etapa === 'ejecucion' && obra.avance < 100}
              onPress={() => ejecutar(() => store.aprobar(obra.id), 'Decisión registrada.')}
              style={styles.actionButton}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function PresupuestoView({obra}: {obra: Obra}): React.ReactElement {
  const {moneda, total, ejercido} = obra.presupuesto;
  const pct = porcentajeMonto(ejercido, total);
  return (
    <View style={styles.block}>
      <Text style={[typography.body, styles.title]}>
        {formatearMonto(ejercido, moneda)} ejercido de {formatearMonto(total, moneda)}
      </Text>
      <ProgressBar progreso={pct} />
      <Text style={[typography.bodySmall, pct > obra.avance + 10 ? styles.alerta : styles.muted]}>
        {pct}% del presupuesto con {obra.avance}% de avance
      </Text>
    </View>
  );
}

function ImpactoView({obra}: {obra: Obra}): React.ReactElement {
  const {impactoEstimado: est, impactoMedido: med} = obra;
  const filas: [string, number, number, string][] = [
    ['CO₂ evitado', med.co2EvitadoKg / 1000, est.co2EvitadoKg / 1000, 't'],
    ['Energía ahorrada', med.energiaAhorradaKwh, est.energiaAhorradaKwh, 'kWh'],
    ['Agua captada', med.aguaCaptadaM3, est.aguaCaptadaM3, 'm³'],
  ];
  return (
    <View style={styles.block}>
      {est.descripcion ? <Text style={[typography.body, styles.muted]}>{est.descripcion}</Text> : null}
      {filas.map(([label, medido, estimado, unidad]) => (
        <View key={label} style={styles.faseHeader}>
          <Text style={[typography.bodySmall, styles.title]}>{label}</Text>
          <Text style={[typography.bodySmall, styles.muted]}>
            {formatearNumero(medido, 1)} medido / {formatearNumero(estimado, 1)} {unidad} estimado
          </Text>
        </View>
      ))}
      <Text style={[typography.bodySmall, styles.muted]}>{obra.mediciones.length} mediciones registradas</Text>
    </View>
  );
}

function SolicitarCambiosForm({
  enviando,
  onSubmit,
  onCancel,
}: {
  enviando: boolean;
  onSubmit: (comentario: string) => void;
  onCancel: () => void;
}): React.ReactElement {
  const [comentario, setComentario] = useState('');
  return (
    <View style={styles.form}>
      <TextField
        label="¿Qué hay que cambiar?"
        value={comentario}
        onChangeText={setComentario}
        multiline
        placeholder="Describe los cambios solicitados"
      />
      <View style={styles.formActions}>
        <PrimaryButton label="Cancelar" variant="secondary" onPress={onCancel} style={styles.actionButton} />
        <PrimaryButton
          label="Enviar"
          loading={enviando}
          disabled={!comentario.trim()}
          onPress={() => onSubmit(comentario.trim())}
          style={styles.actionButton}
        />
      </View>
    </View>
  );
}

function MedicionForm({
  enviando,
  onSubmit,
  onCancel,
}: {
  enviando: boolean;
  onSubmit: (input: {fecha: string; co2EvitadoKg: number; energiaAhorradaKwh: number; aguaCaptadaM3: number; fuente: string}) => void;
  onCancel: () => void;
}): React.ReactElement {
  const [co2, setCo2] = useState('');
  const [energia, setEnergia] = useState('');
  const [agua, setAgua] = useState('');
  const [fuente, setFuente] = useState('');
  const numero = (texto: string) => Number(texto.replace(',', '.')) || 0;
  const valido = fuente.trim() && numero(co2) + numero(energia) + numero(agua) > 0;
  return (
    <View style={styles.form}>
      <Text style={[typography.h3, styles.title]}>Registrar medición de hoy</Text>
      <TextField label="CO₂ evitado (kg)" value={co2} onChangeText={setCo2} keyboardType="decimal-pad" />
      <TextField label="Energía ahorrada (kWh)" value={energia} onChangeText={setEnergia} keyboardType="decimal-pad" />
      <TextField label="Agua captada (m³)" value={agua} onChangeText={setAgua} keyboardType="decimal-pad" />
      <TextField label="Fuente" value={fuente} onChangeText={setFuente} placeholder="Medidor, recibo, bitácora…" />
      <View style={styles.formActions}>
        <PrimaryButton label="Cancelar" variant="secondary" onPress={onCancel} style={styles.actionButton} />
        <PrimaryButton
          label="Guardar"
          loading={enviando}
          disabled={!valido}
          onPress={() =>
            onSubmit({
              fecha: fechaLocalISO(),
              co2EvitadoKg: numero(co2),
              energiaAhorradaKwh: numero(energia),
              aguaCaptadaM3: numero(agua),
              fuente: fuente.trim(),
            })
          }
          style={styles.actionButton}
        />
      </View>
    </View>
  );
}

function Section({title, children}: {title: string; children: React.ReactNode}): React.ReactElement {
  return (
    <View style={styles.section}>
      <Text style={[typography.h3, styles.title]}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.hueso},
  center: {alignItems: 'center', justifyContent: 'center', padding: 24},
  content: {padding: 20, paddingBottom: 24, gap: 18},
  header: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8},
  title: {flexShrink: 1, color: colors.negro},
  muted: {color: colors.piedra},
  alerta: {color: colors.terracota, fontWeight: '600'},
  exito: {color: colors.verdeBosqueClaro, fontWeight: '600'},
  block: {gap: 6},
  section: {gap: 8},
  row: {
    gap: 4,
    backgroundColor: colors.blanco,
    borderWidth: 1,
    borderColor: colors.linea,
    borderRadius: 10,
    padding: 12,
  },
  faseHeader: {flexDirection: 'row', justifyContent: 'space-between', gap: 8},
  form: {
    gap: 12,
    backgroundColor: colors.blanco,
    borderWidth: 1,
    borderColor: colors.linea,
    borderRadius: 12,
    padding: 14,
  },
  formActions: {flexDirection: 'row', gap: 12},
  actions: {
    flexDirection: 'row',
    gap: 10,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: colors.linea,
    backgroundColor: colors.blanco,
  },
  actionButton: {flex: 1},
});
