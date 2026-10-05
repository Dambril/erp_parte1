import React, {useState} from 'react';
import {KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {mensajeError} from '@erp/api-client';
import {NewPasswordFormSchema} from '@erp/domain';
import {colors} from '../theme/colors';
import {typography} from '../theme/typography';
import {useAuth} from '../state/AuthContext';
import {PasswordField} from '../components/PasswordField';
import {PrimaryButton} from '../components/PrimaryButton';
import {TextLink} from '../components/TextLink';
import {apiClient} from '../lib/apiClient';
import type {RootStackParamList} from '../navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'ResetPassword' | 'AcceptInvitation'>;

const TEXTS = {
  ResetPassword: {title: 'Crear contraseña nueva', text: null, done: 'Tu contraseña se actualizó. Inicia sesión con la nueva.'},
  AcceptInvitation: {
    title: 'Crea tu contraseña',
    text: 'Te invitaron a un espacio de trabajo en T-ssera. Define tu contraseña para activar la cuenta.',
    done: 'Tu cuenta está activa. Ya puedes iniciar sesión.',
  },
} as const;

/** Destino de los enlaces de los correos: restablecer la contraseña o activar una cuenta invitada. Misma pantalla, distinto endpoint. */
export function NewPasswordScreen({navigation, route}: Props): React.ReactElement {
  const {status, logout} = useAuth();
  const token = route.params?.token;
  const texts = TEXTS[route.name];
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<{password?: string; confirmPassword?: string}>({});
  const [formError, setFormError] = useState<string | null>(token ? null : 'El enlace no es válido o ya venció. Solicita uno nuevo.');
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  const leave = () => navigation.reset({index: 0, routes: [{name: status === 'signedIn' ? 'Main' : 'Login'}]});

  const handleSubmit = async () => {
    if (!token) return;
    // Mismo esquema que valida la API (packages/domain): 15 a 128 caracteres y que ambas coincidan.
    const parsed = NewPasswordFormSchema.safeParse({password, confirmPassword});
    if (!parsed.success) {
      const fields = parsed.error.flatten().fieldErrors;
      setErrors({password: fields.password?.[0], confirmPassword: fields.confirmPassword?.[0]});
      return;
    }
    setErrors({});
    setFormError(null);
    setSending(true);
    try {
      const input = {token, password: parsed.data.password};
      await (route.name === 'AcceptInvitation' ? apiClient.acceptInvitation(input) : apiClient.resetPassword(input));
      // La API cerró todas las sesiones de la cuenta: si este dispositivo tenía una, se cierra también aquí.
      if (status === 'signedIn') await logout();
      setDone(true);
    } catch (err) {
      setFormError(mensajeError(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={[typography.h1, styles.title]} accessibilityRole="header">
            {done ? 'Listo' : texts.title}
          </Text>
          {done ? (
            <Text style={[typography.body, styles.text]} accessibilityLiveRegion="polite">
              {texts.done}
            </Text>
          ) : texts.text ? (
            <Text style={[typography.body, styles.text]}>{texts.text}</Text>
          ) : null}
        </View>

        {done ? (
          <PrimaryButton label="Iniciar sesión" onPress={leave} />
        ) : (
          <>
            <PasswordField
              label="Nueva contraseña"
              hint="Mínimo 15 caracteres. Puedes usar una frase."
              value={password}
              onChangeText={setPassword}
              autoComplete="new-password"
              textContentType="newPassword"
              error={errors.password}
              editable={!sending && !!token}
            />
            <PasswordField
              label="Confirmar contraseña"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              autoComplete="new-password"
              textContentType="newPassword"
              error={errors.confirmPassword}
              editable={!sending && !!token}
              onSubmitEditing={handleSubmit}
            />
            {formError ? (
              <Text style={[typography.body, styles.formError]} accessibilityLiveRegion="polite">
                {formError}
              </Text>
            ) : null}
            <PrimaryButton label="Guardar contraseña" onPress={handleSubmit} loading={sending} disabled={!token} />
            <TextLink
              label={status === 'signedIn' ? 'Volver al inicio' : 'Volver a iniciar sesión'}
              onPress={leave}
              disabled={sending}
            />
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.hueso},
  content: {flexGrow: 1, justifyContent: 'center', padding: 24, gap: 16},
  header: {gap: 8, marginBottom: 8},
  title: {color: colors.negro},
  text: {color: colors.piedra},
  formError: {color: colors.terracota},
});
