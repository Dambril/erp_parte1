import React, {useState} from 'react';
import {KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {mensajeError} from '@erp/api-client';
import {ForgotPasswordRequestSchema} from '@erp/domain';
import {colors} from '../theme/colors';
import {typography} from '../theme/typography';
import {PrimaryButton} from '../components/PrimaryButton';
import {TextField} from '../components/TextField';
import {TextLink} from '../components/TextLink';
import {apiClient} from '../lib/apiClient';
import type {RootStackParamList} from '../navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'ForgotPassword'>;

export function ForgotPasswordScreen({navigation, route}: Props): React.ReactElement {
  const [email, setEmail] = useState(route.params?.email ?? '');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const handleSubmit = async () => {
    const parsed = ForgotPasswordRequestSchema.safeParse({email});
    setEmailError(parsed.success ? null : 'Ingresa un correo válido.');
    setFormError(null);
    if (!parsed.success) return;

    setSending(true);
    try {
      await apiClient.forgotPassword(parsed.data.email);
      navigation.replace('CheckEmail', {email: parsed.data.email});
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
            Recupera tu acceso
          </Text>
          <Text style={[typography.body, styles.text]}>
            Escribe el correo de tu cuenta y te enviaremos un enlace para crear una contraseña nueva.
          </Text>
        </View>

        <TextField
          label="Correo"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          keyboardType="email-address"
          placeholder="tu@empresa.com"
          error={emailError}
          editable={!sending}
          onSubmitEditing={handleSubmit}
        />

        {formError ? <Text style={[typography.body, styles.formError]}>{formError}</Text> : null}

        <PrimaryButton label="Enviar enlace" onPress={handleSubmit} loading={sending} />
        <TextLink label="Volver a iniciar sesión" onPress={() => navigation.popToTop()} disabled={sending} />
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
