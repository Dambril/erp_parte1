import React, {useState} from 'react';
import {KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {colors} from '@erp/ui';
import {ChangePasswordFormSchema, PASSWORD_MIN_LENGTH} from '@erp/domain';
import {ApiError, erroresPorCampo, mensajeError} from '@erp/api-client';
import {typography} from '../theme/typography';
import {apiClient} from '../lib/apiClient';
import {Card, Notice} from '../components/Card';
import {PasswordField} from '../components/PasswordField';
import {PrimaryButton} from '../components/PrimaryButton';
import type {RootStackParamList} from '../navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'ChangePassword'>;
type Field = 'currentPassword' | 'newPassword' | 'confirmPassword';

export function ChangePasswordScreen({navigation}: Props): React.ReactElement {
  const [values, setValues] = useState<Record<Field, string>>({currentPassword: '', newPassword: '', confirmPassword: ''});
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const set = (field: Field) => (value: string) => {
    setValues((current) => ({...current, [field]: value}));
    setErrors((current) => ({...current, [field]: undefined}));
  };

  const save = async () => {
    setNotice(null);
    const parsed = ChangePasswordFormSchema.safeParse(values);
    if (!parsed.success) {
      const found: Partial<Record<Field, string>> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as Field;
        found[field] ??= issue.message;
      }
      setErrors(found);
      return;
    }
    setBusy(true);
    try {
      await apiClient.changePassword({currentPassword: parsed.data.currentPassword, newPassword: parsed.data.newPassword});
      setDone(true);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'INVALID_CURRENT_PASSWORD') {
        setErrors({currentPassword: mensajeError(error)});
      } else {
        setErrors(erroresPorCampo(error));
        setNotice(mensajeError(error));
      }
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Card title="Contraseña actualizada">
          <Text style={[typography.body, styles.text]}>
            Cerramos tus sesiones en otros dispositivos. En este sigues dentro.
          </Text>
        </Card>
        <PrimaryButton label="Listo" onPress={() => navigation.goBack()} />
      </ScrollView>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <PasswordField
          label="Contraseña actual"
          value={values.currentPassword}
          onChangeText={set('currentPassword')}
          error={errors.currentPassword}
          autoComplete="current-password"
        />
        <PasswordField
          label="Contraseña nueva"
          value={values.newPassword}
          onChangeText={set('newPassword')}
          error={errors.newPassword}
          hint={`Al menos ${PASSWORD_MIN_LENGTH} caracteres. Puedes usar una frase.`}
          autoComplete="new-password"
        />
        <PasswordField
          label="Confirmar contraseña nueva"
          value={values.confirmPassword}
          onChangeText={set('confirmPassword')}
          error={errors.confirmPassword}
          autoComplete="new-password"
        />
        <Text style={[typography.bodySmall, styles.muted]}>Al cambiarla se cerrarán tus sesiones en otros dispositivos.</Text>
        {notice ? <Notice text={notice} tone="error" /> : null}
        <PrimaryButton label="Cambiar contraseña" onPress={() => void save()} loading={busy} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.bone},
  content: {padding: 20, gap: 16},
  text: {color: colors.ink},
  muted: {color: colors.inkSecondary},
});
