import React, {useState} from 'react';
import {Image, KeyboardAvoidingView, Platform, StyleSheet, Text, View} from 'react-native';
import {colors} from '../theme/colors';
import {typography} from '../theme/typography';
import {useAuth} from '../state/AuthContext';
import {PrimaryButton} from '../components/PrimaryButton';
import {TextField} from '../components/TextField';

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function LoginScreen(): React.ReactElement {
  const {login, isLoggingIn} = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = async () => {
    const nextEmailError = isValidEmail(email) ? null : 'Ingresa un correo válido.';
    const nextPasswordError = password ? null : 'Ingresa tu contraseña.';
    setEmailError(nextEmailError);
    setPasswordError(nextPasswordError);
    setFormError(null);
    if (nextEmailError || nextPasswordError) return;

    try {
      await login(email, password);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'No se pudo iniciar sesión.');
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.logoWrap}>
        <Image
          source={require('../assets/logo2.png')}
          style={styles.logo}
          resizeMode="contain"
          accessibilityLabel="T-SSERA Construcciones"
        />
      </View>

      <View style={styles.form}>
        <Text style={[typography.h1, styles.title]}>Inicia sesión</Text>
        <Text style={[typography.body, styles.subtitle]}>
          Accede al panel de obras y certificaciones.
        </Text>

        <TextField
          label="Correo"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="tucorreo@tssera.com"
          error={emailError}
        />
        <TextField
          label="Contraseña"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder="••••••••"
          error={passwordError}
        />

        {formError ? <Text style={[typography.bodySmall, styles.formError]}>{formError}</Text> : null}

        <PrimaryButton
          label="Entrar"
          onPress={handleSubmit}
          loading={isLoggingIn}
          style={styles.submit}
        />

        <Text style={[typography.bodySmall, styles.hint]}>
          ¿Sin acceso? Pide a un administrador que te cree una cuenta.
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.hueso,
  },
  logoWrap: {
    height: 180,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.lima,
  },
  logo: {
    width: 140,
    height: 140,
  },
  form: {
    flex: 1,
    padding: 24,
    gap: 14,
  },
  title: {
    color: colors.negro,
  },
  subtitle: {
    color: colors.piedra,
    marginBottom: 8,
  },
  formError: {
    color: colors.terracota,
  },
  submit: {
    marginTop: 8,
  },
  hint: {
    textAlign: 'center',
    color: colors.piedra,
    marginTop: 8,
  },
});
