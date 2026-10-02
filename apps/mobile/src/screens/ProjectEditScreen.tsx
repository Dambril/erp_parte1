import React, {useEffect, useState} from 'react';
import {KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {colors} from '@erp/ui';
import {
  PHASE_STATUS_LABEL, PhaseStatusSchema, PROJECT_STATUS_LABEL, PROJECT_TRANSITIONS, PROJECT_TYPE_LABEL, ProjectTypeSchema,
  UpdateProjectSchema, type PhaseStatus, type ProjectType,
} from '@erp/domain';
import {typography} from '../theme/typography';
import {useResource} from '../hooks/useResource';
import {useSubmit} from '../hooks/useSubmit';
import {apiClient} from '../lib/apiClient';
import {Card, Notice} from '../components/Card';
import {FilterChip} from '../components/FilterChip';
import {PrimaryButton} from '../components/PrimaryButton';
import {TextField} from '../components/TextField';
import {TextLink} from '../components/TextLink';
import type {RootStackParamList} from '../navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'ProjectEdit'>;

interface PhaseForm {
  /** Sin `key` es una fase nueva: la API le asigna una. */
  key?: string;
  /** Identidad dentro del formulario (las fases nuevas aún no tienen `key`). */
  formId: string;
  name: string;
  plannedStart: string;
  plannedEnd: string;
  status: PhaseStatus;
}

let nextFormId = 0;

/** Edición mínima: datos generales, cronograma, avance y cambio de estado. El presupuesto no se edita aquí. */
export function ProjectEditScreen({route, navigation}: Props): React.ReactElement {
  const {projectId} = route.params;
  const {data: project, error: loadError} = useResource(() => apiClient.construction.projects.get(projectId), `edit:${projectId}`);
  const save = useSubmit();
  const transition = useSubmit();

  const [loaded, setLoaded] = useState(false);
  const [name, setName] = useState('');
  const [client, setClient] = useState('');
  const [location, setLocation] = useState('');
  const [type, setType] = useState<ProjectType>('residential');
  const [progress, setProgress] = useState('0');
  const [phases, setPhases] = useState<PhaseForm[]>([]);
  const [formError, setFormError] = useState<string | null>(null);

  // El formulario se llena una sola vez: un aviso de cambio no debe pisar lo que la persona está escribiendo.
  useEffect(() => {
    if (!project || loaded) return;
    setName(project.name);
    setClient(project.client.name);
    setLocation(project.location);
    setType(project.type);
    setProgress(String(project.progressPct));
    setPhases(project.phases.map((phase) => ({...phase, formId: phase.key})));
    setLoaded(true);
  }, [project, loaded]);

  if (!project || !loaded) {
    return (
      <View style={[styles.screen, styles.center]}>
        <Notice text={loadError ?? 'Cargando…'} tone={loadError ? 'error' : 'muted'} />
      </View>
    );
  }

  const setPhase = (formId: string, changes: Partial<PhaseForm>) =>
    setPhases((current) => current.map((phase) => (phase.formId === formId ? {...phase, ...changes} : phase)));

  const submit = () => {
    const parsed = UpdateProjectSchema.safeParse({
      name,
      client: {name: client},
      location,
      type,
      progressPct: /^\d{1,3}$/.test(progress.trim()) ? Number(progress.trim()) : -1,
      phases: phases.map(({key, name: phaseName, plannedStart, plannedEnd, status}) => ({
        ...(key ? {key} : {}),
        name: phaseName,
        plannedStart: plannedStart.trim(),
        plannedEnd: plannedEnd.trim(),
        status,
      })),
    });
    if (!parsed.success) {
      const [issue] = parsed.error.issues;
      const field = String(issue.path[0]);
      setFormError(
        field === 'progressPct'
          ? 'El avance debe ser un número entero entre 0 y 100.'
          : field === 'phases'
            ? `Revisa la fase ${Number(issue.path[1]) + 1}: nombre y fechas en formato AAAA-MM-DD, con el fin posterior al inicio.`
            : 'Nombre, cliente y ubicación son obligatorios.',
      );
      return;
    }
    setFormError(null);
    void save.submit(() => apiClient.construction.projects.update(projectId, parsed.data), () => navigation.goBack());
  };

  const [nextStatus] = PROJECT_TRANSITIONS[project.status];

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Card title="Datos generales">
          <TextField label="Nombre" value={name} onChangeText={setName} maxLength={160} />
          <TextField label="Cliente" value={client} onChangeText={setClient} maxLength={160} />
          <TextField label="Ubicación" value={location} onChangeText={setLocation} maxLength={160} />
          <View style={styles.chips}>
            {ProjectTypeSchema.options.map((option) => (
              <FilterChip key={option} label={PROJECT_TYPE_LABEL[option]} active={type === option} onPress={() => setType(option)} />
            ))}
          </View>
          <TextField label="Avance (%)" value={progress} onChangeText={setProgress} keyboardType="number-pad" maxLength={3} />
        </Card>

        <Card title="Cronograma">
          {phases.length === 0 ? <Notice text="Sin fases. Agrega la primera." /> : null}
          {phases.map((phase, index) => (
            <View key={phase.formId} style={styles.phase}>
              <Text style={[typography.label, styles.muted]}>FASE {index + 1}</Text>
              <TextField label="Nombre" value={phase.name} onChangeText={(value) => setPhase(phase.formId, {name: value})} maxLength={120} />
              <View style={styles.dates}>
                <View style={styles.date}>
                  <TextField
                    label="Inicio"
                    value={phase.plannedStart}
                    onChangeText={(value) => setPhase(phase.formId, {plannedStart: value})}
                    placeholder="AAAA-MM-DD"
                    maxLength={10}
                  />
                </View>
                <View style={styles.date}>
                  <TextField
                    label="Fin"
                    value={phase.plannedEnd}
                    onChangeText={(value) => setPhase(phase.formId, {plannedEnd: value})}
                    placeholder="AAAA-MM-DD"
                    maxLength={10}
                  />
                </View>
              </View>
              <View style={styles.chips}>
                {PhaseStatusSchema.options.map((option) => (
                  <FilterChip
                    key={option}
                    label={PHASE_STATUS_LABEL[option]}
                    active={phase.status === option}
                    onPress={() => setPhase(phase.formId, {status: option})}
                  />
                ))}
              </View>
              <TextLink
                label="Quitar fase"
                style={styles.link}
                onPress={() => setPhases((current) => current.filter((item) => item.formId !== phase.formId))}
              />
            </View>
          ))}
          <PrimaryButton
            label="Agregar fase"
            variant="secondary"
            onPress={() =>
              setPhases((current) => [
                ...current,
                {formId: `new-${nextFormId++}`, name: '', plannedStart: '', plannedEnd: '', status: 'pending'},
              ])
            }
          />
        </Card>

        <Card title="Estado de la obra">
          <Text style={[typography.body, styles.text]}>Estado actual: {PROJECT_STATUS_LABEL[project.status]}</Text>
          {nextStatus ? (
            <PrimaryButton
              label={`Pasar a ${PROJECT_STATUS_LABEL[nextStatus]}`}
              variant="secondary"
              loading={transition.busy}
              onPress={() => void transition.submit(() => apiClient.construction.projects.transition(projectId, nextStatus), () => undefined)}
            />
          ) : (
            <Notice text="La obra ya está completada." />
          )}
          {transition.error ? <Notice text={transition.error} tone="error" /> : null}
        </Card>

        {formError || save.error ? <Notice text={(formError || save.error)!} tone="error" /> : null}
        <PrimaryButton label="Guardar cambios" onPress={submit} loading={save.busy} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.bone},
  center: {alignItems: 'center', justifyContent: 'center', padding: 24},
  content: {padding: 20, paddingBottom: 32, gap: 14},
  text: {color: colors.ink},
  muted: {color: colors.inkSecondary},
  chips: {flexDirection: 'row', gap: 8, flexWrap: 'wrap'},
  phase: {gap: 10, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.line},
  dates: {flexDirection: 'row', gap: 10},
  date: {flex: 1},
  link: {alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center'},
});
