import React, {useEffect, useState} from 'react';
import {KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {colors, radii} from '@erp/ui';
import {
  CERTIFICATION_LEVELS, CERTIFICATION_TYPE_LABEL, CertificationTypeSchema, formatDate, formatMoney, PROJECT_TYPE_LABEL,
  PROPOSAL_STEP_SCHEMAS, ProposalDraftSchema, ProposalSubmitSchema, ProjectTypeSchema,
} from '@erp/domain';
import {ApiError, erroresPorCampo, mensajeError} from '@erp/api-client';
import {typography} from '../theme/typography';
import {useAuth} from '../state/AuthContext';
import {useConstruction} from '../state/ConstructionContext';
import {useResource} from '../hooks/useResource';
import {apiClient} from '../lib/apiClient';
import {Card, Notice} from '../components/Card';
import {DateField} from '../components/DateField';
import {FilterChip} from '../components/FilterChip';
import {ErrorState, ListSkeleton} from '../components/ListStates';
import {MoneyField} from '../components/MoneyField';
import {PrimaryButton} from '../components/PrimaryButton';
import {StepIndicator} from '../components/StepIndicator';
import {TextField} from '../components/TextField';
import {TextLink} from '../components/TextLink';
import type {RootStackParamList} from '../navigation/RootNavigator';
import {
  describeMissing, EMPTY_FORM, errorsOfStep, fromDetail, newMaterialRow, STEP_TITLES, stepOf, toFieldErrors, toRequest,
  type FieldErrors, type MaterialRow, type ProposalFormState,
} from './proposalForm';

type Props = NativeStackScreenProps<RootStackParamList, 'ProposalForm'>;

const LAST_STEP = STEP_TITLES.length - 1;

/** Nueva propuesta o edición de un borrador, en 4 pasos. "Guardar borrador" funciona en cualquiera. */
export function ProposalFormScreen({route, navigation}: Props): React.ReactElement {
  const initialId = route.params?.proposalId;
  const {can} = useAuth();
  const {refresh} = useConstruction();
  const existing = useResource(() => apiClient.construction.proposals.get(initialId!), `proposal-form:${initialId}`, !!initialId);

  const [proposalId, setProposalId] = useState(initialId);
  const [form, setForm] = useState<ProposalFormState>(EMPTY_FORM);
  const [loaded, setLoaded] = useState(!initialId);
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState<'draft' | 'submit' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    navigation.setOptions({title: initialId ? 'Editar propuesta' : 'Nueva propuesta'});
  }, [navigation, initialId]);

  // Se llena una sola vez: un aviso de cambio no debe pisar lo que la persona está escribiendo.
  useEffect(() => {
    if (!existing.data || loaded) return;
    setForm(fromDetail(existing.data));
    setLoaded(true);
  }, [existing.data, loaded]);

  if (!loaded) {
    return (
      <View style={[styles.screen, styles.padded]}>
        {existing.error ? <ErrorState message={existing.error} onRetry={existing.reload} /> : <ListSkeleton count={3} />}
      </View>
    );
  }
  if (existing.data && existing.data.status !== 'draft') {
    return (
      <View style={[styles.screen, styles.padded]}>
        <Notice text="Solo se puede editar una propuesta en borrador." tone="error" />
      </View>
    );
  }

  const set = <K extends keyof ProposalFormState>(field: K, value: ProposalFormState[K]) => {
    setForm((current) => ({...current, [field]: value}));
    setErrors(({[field]: _removed, ...rest}) => rest);
  };
  const setMaterial = (formId: string, changes: Partial<MaterialRow>) =>
    setForm((current) => ({...current, materials: current.materials.map((row) => (row.formId === formId ? {...row, ...changes} : row))}));

  /** Muestra los errores y lleva al primer paso que tiene alguno. */
  const showErrors = (found: FieldErrors) => {
    setErrors(found);
    const steps = Object.keys(found).map(stepOf);
    if (steps.length) setStep(Math.min(...steps));
  };

  const validateStep = (): boolean => {
    const {body, errors: captureErrors, materialIds} = toRequest(form);
    const parsed = PROPOSAL_STEP_SCHEMAS[step as 0 | 1 | 2].safeParse(body);
    const found = {...(parsed.success ? {} : toFieldErrors(parsed.error.issues, materialIds)), ...errorsOfStep(captureErrors, step)};
    setErrors(found);
    return Object.keys(found).length === 0;
  };

  /** Crea el borrador o guarda los cambios. Devuelve su id, o null si algo impidió guardarlo. */
  const save = async (): Promise<string | null> => {
    const {body, errors: captureErrors, materialIds} = toRequest(form);
    const parsed = ProposalDraftSchema.safeParse(body);
    const found = {...(parsed.success ? {} : toFieldErrors(parsed.error.issues, materialIds)), ...captureErrors};
    if (Object.keys(found).length) {
      showErrors(found);
      return null;
    }
    try {
      const saved = proposalId
        ? await apiClient.construction.proposals.update(proposalId, body)
        : await apiClient.construction.proposals.create(body);
      setProposalId(saved.id);
      refresh();
      return saved.id;
    } catch (error) {
      showErrors(toFieldErrors(Object.entries(erroresPorCampo(error)).map(([path, message]) => ({path, message})), materialIds));
      setNotice(mensajeError(error));
      return null;
    }
  };

  const saveDraft = async () => {
    setBusy('draft');
    setNotice(null);
    const id = await save();
    setBusy(null);
    if (id) navigation.replace('ProposalDetail', {proposalId: id});
  };

  const sendToReview = async () => {
    setNotice(null);
    const {body, errors: captureErrors, materialIds} = toRequest(form);
    const parsed = ProposalSubmitSchema.safeParse(body);
    const found = {...(parsed.success ? {} : toFieldErrors(parsed.error.issues, materialIds)), ...captureErrors};
    if (Object.keys(found).length) {
      showErrors(found);
      setNotice(`Para enviar a revisión falta completar: ${describeMissing(found)}.`);
      return;
    }
    setBusy('submit');
    const id = await save();
    if (!id) {
      setBusy(null);
      return;
    }
    try {
      await apiClient.construction.proposals.submit(id);
      refresh();
      navigation.replace('ProposalDetail', {proposalId: id});
    } catch (error) {
      // Lo guardado no cumple algo que el cliente no detectó: la API dice qué campo.
      if (error instanceof ApiError && error.code === 'VALIDATION_ERROR') {
        showErrors(toFieldErrors(error.details.map((detail) => ({path: detail.field ?? '', message: detail.message})), materialIds));
      }
      setNotice(`Se guardó el borrador, pero no se pudo enviar. ${mensajeError(error)}`);
      setBusy(null);
    }
  };

  const next = () => {
    setNotice(null);
    if (validateStep()) setStep((current) => current + 1);
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <StepIndicator step={step} titles={STEP_TITLES} />
        {step === 0 ? <GeneralStep form={form} errors={errors} set={set} /> : null}
        {step === 1 ? <ScheduleStep form={form} errors={errors} set={set} /> : null}
        {step === 2 ? (
          <SustainabilityStep form={form} errors={errors} set={set} setMaterial={setMaterial} />
        ) : null}
        {step === LAST_STEP ? <ReviewStep form={form} onEdit={setStep} /> : null}
        {notice ? <Notice text={notice} tone="error" /> : null}
      </ScrollView>

      <View style={styles.bar}>
        <TextLink label={busy === 'draft' ? 'Guardando…' : 'Guardar borrador'} onPress={saveDraft} disabled={busy !== null} style={styles.draft} />
        <View style={styles.barRow}>
          <PrimaryButton
            label="Atrás"
            variant="secondary"
            onPress={() => (step === 0 ? navigation.goBack() : setStep(step - 1))}
            disabled={busy !== null}
            style={styles.barButton}
          />
          {step < LAST_STEP ? (
            <PrimaryButton label="Siguiente" onPress={next} disabled={busy !== null} style={styles.barButton} />
          ) : can('construction.proposals:submit') ? (
            <PrimaryButton label="Enviar a revisión" onPress={sendToReview} loading={busy === 'submit'} disabled={busy === 'draft'} style={styles.barButton} />
          ) : null}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

interface StepProps {
  form: ProposalFormState;
  errors: FieldErrors;
  set: <K extends keyof ProposalFormState>(field: K, value: ProposalFormState[K]) => void;
}

function GeneralStep({form, errors, set}: StepProps): React.ReactElement {
  return (
    <View style={styles.fields}>
      <TextField label="Nombre de la propuesta" value={form.name} onChangeText={(value) => set('name', value)} maxLength={160} error={errors.name} />
      <TextField label="Cliente" value={form.clientName} onChangeText={(value) => set('clientName', value)} maxLength={160} error={errors.clientName} />
      <TextField label="Ubicación" value={form.location} onChangeText={(value) => set('location', value)} maxLength={160} error={errors.location} />
      <ChoiceGroup
        label="Tipo de obra"
        options={ProjectTypeSchema.options.map((type) => ({value: type, label: PROJECT_TYPE_LABEL[type]}))}
        value={form.type}
        onChange={(value) => set('type', value)}
        error={errors.type}
      />
      <TextField
        label="Alcance"
        value={form.scope}
        onChangeText={(value) => set('scope', value)}
        multiline
        maxLength={4000}
        placeholder="Qué incluye la obra"
        error={errors.scope}
        style={styles.multiline}
      />
    </View>
  );
}

function ScheduleStep({form, errors, set}: StepProps): React.ReactElement {
  return (
    <View style={styles.fields}>
      <DateField label="Inicio estimado" value={form.estimatedStart} onChange={(value) => set('estimatedStart', value)} error={errors.estimatedStart} />
      <DateField label="Entrega estimada" value={form.estimatedEnd} onChange={(value) => set('estimatedEnd', value)} error={errors.estimatedEnd} />
      <MoneyField label="Presupuesto estimado (MXN)" value={form.budget} onChangeText={(value) => set('budget', value)} error={errors.budget} />
    </View>
  );
}

function SustainabilityStep({
  form, errors, set, setMaterial,
}: StepProps & {setMaterial: (formId: string, changes: Partial<MaterialRow>) => void}): React.ReactElement {
  const levels = form.certification ? CERTIFICATION_LEVELS[form.certification] : [];
  return (
    <View style={styles.fields}>
      <ChoiceGroup
        label="Certificación objetivo"
        options={CertificationTypeSchema.options.map((type) => ({value: type, label: CERTIFICATION_TYPE_LABEL[type]}))}
        value={form.certification}
        onChange={(value) => {
          set('certification', value);
          set('level', null);
        }}
        error={errors.certification}
      />
      {levels.length > 0 ? (
        <ChoiceGroup
          label="Nivel"
          options={levels.map((level) => ({value: level, label: level}))}
          value={form.level}
          onChange={(value) => set('level', value)}
          error={errors.level}
        />
      ) : null}

      <Text style={[typography.h3, styles.section]}>Metas (opcionales)</Text>
      <TextField label="CO₂ evitado (t/año)" value={form.co2} onChangeText={(value) => set('co2', value)} keyboardType="decimal-pad" error={errors.co2} />
      <TextField label="Ahorro de energía (%)" value={form.energy} onChangeText={(value) => set('energy', value)} keyboardType="decimal-pad" error={errors.energy} />
      <TextField label="Agua captada (m³/año)" value={form.water} onChangeText={(value) => set('water', value)} keyboardType="decimal-pad" error={errors.water} />

      <Text style={[typography.h3, styles.section]}>Materiales</Text>
      {form.materials.length === 0 ? <Notice text="Sin materiales. Agrega los principales con su origen y proveedor." /> : null}
      {form.materials.map((row, index) => {
        const error = (field: string) => errors[`material:${row.formId}:${field}`];
        return (
          <Card
            key={row.formId}
            title={`Material ${index + 1}`}
            action={
              <TextLink
                label="Quitar"
                onPress={() => set('materials', form.materials.filter((item) => item.formId !== row.formId))}
              />
            }>
            <TextField label="Material" value={row.name} onChangeText={(name) => setMaterial(row.formId, {name})} maxLength={160} error={error('name')} />
            <TextField label="Origen" value={row.origin} onChangeText={(origin) => setMaterial(row.formId, {origin})} maxLength={160} error={error('origin')} />
            <TextField label="Proveedor" value={row.supplier} onChangeText={(supplier) => setMaterial(row.formId, {supplier})} maxLength={160} error={error('supplier')} />
          </Card>
        );
      })}
      {form.materials.length < 50 ? (
        <PrimaryButton label="Agregar material" variant="secondary" onPress={() => set('materials', [...form.materials, newMaterialRow()])} />
      ) : null}
    </View>
  );
}

function ReviewStep({form, onEdit}: {form: ProposalFormState; onEdit: (step: number) => void}): React.ReactElement {
  const {body} = toRequest(form);
  const empty = 'Sin capturar';
  const certification = form.certification
    ? form.certification === 'none' ? 'Ninguna' : [CERTIFICATION_TYPE_LABEL[form.certification], form.level].filter(Boolean).join(' ')
    : empty;
  const target = (value: string, unit: string) => (value.trim() ? `${value.trim()} ${unit}` : 'Sin meta');
  return (
    <View style={styles.fields}>
      <Card title="Datos generales" action={<TextLink label="Editar" onPress={() => onEdit(0)} />}>
        <Row label="Nombre" value={form.name.trim() || empty} />
        <Row label="Cliente" value={form.clientName.trim() || empty} />
        <Row label="Ubicación" value={form.location.trim() || empty} />
        <Row label="Tipo" value={form.type ? PROJECT_TYPE_LABEL[form.type] : empty} />
        <Text style={[typography.body, styles.text]}>{form.scope.trim() || 'Sin alcance.'}</Text>
      </Card>
      <Card title="Fechas y presupuesto" action={<TextLink label="Editar" onPress={() => onEdit(1)} />}>
        <Row label="Inicio" value={form.estimatedStart ? formatDate(form.estimatedStart) : empty} />
        <Row label="Entrega" value={form.estimatedEnd ? formatDate(form.estimatedEnd) : empty} />
        <Row label="Presupuesto" value={body.estimatedBudget ? formatMoney(body.estimatedBudget) : empty} />
      </Card>
      <Card title="Sustentabilidad y materiales" action={<TextLink label="Editar" onPress={() => onEdit(2)} />}>
        <Row label="Certificación" value={certification} />
        <Row label="CO₂ evitado" value={target(form.co2, 't/año')} />
        <Row label="Ahorro de energía" value={target(form.energy, '%')} />
        <Row label="Agua captada" value={target(form.water, 'm³/año')} />
        {(body.materials ?? []).map((material, index) => (
          <Text key={index} style={[typography.bodySmall, styles.muted]}>
            {material.name} · {material.supplier || 'sin proveedor'} · origen {material.origin || 'sin indicar'}
          </Text>
        ))}
      </Card>
    </View>
  );
}

function ChoiceGroup<T extends string>({
  label, options, value, onChange, error,
}: {
  label: string;
  options: {value: T; label: string}[];
  value: T | null;
  onChange: (value: T) => void;
  error?: string;
}): React.ReactElement {
  return (
    <View style={styles.choice}>
      <Text style={[typography.label, styles.label]}>{label}</Text>
      <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel={label}>
        {options.map((option) => (
          <FilterChip key={option.value} label={option.label} active={value === option.value} onPress={() => onChange(option.value)} />
        ))}
      </View>
      {error ? <Text style={[typography.bodySmall, styles.error]}>{error}</Text> : null}
    </View>
  );
}

function Row({label, value}: {label: string; value: string}): React.ReactElement {
  return (
    <View style={styles.row}>
      <Text style={[typography.body, styles.muted]}>{label}</Text>
      <Text style={[typography.body, styles.rowValue]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.bone},
  padded: {padding: 20},
  content: {padding: 20, paddingBottom: 32, gap: 18},
  fields: {gap: 14},
  section: {color: colors.ink, marginTop: 6},
  multiline: {minHeight: 96, textAlignVertical: 'top'},
  choice: {gap: 6},
  label: {color: colors.stone, textTransform: 'uppercase', letterSpacing: 0.4},
  chips: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  error: {color: colors.danger},
  text: {color: colors.ink},
  muted: {color: colors.inkSecondary},
  row: {flexDirection: 'row', justifyContent: 'space-between', gap: 12},
  rowValue: {color: colors.ink, fontWeight: '600', flexShrink: 1, textAlign: 'right'},
  bar: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
    gap: 6,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.white,
    borderTopLeftRadius: radii.card,
    borderTopRightRadius: radii.card,
  },
  draft: {alignSelf: 'center'},
  barRow: {flexDirection: 'row', gap: 12},
  barButton: {flex: 1},
});
