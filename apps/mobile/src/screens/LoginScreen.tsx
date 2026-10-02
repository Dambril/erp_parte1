import React, {useState} from 'react';
import {Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {ForgotPasswordRequestSchema} from '@erp/domain';
import {colors} from '../theme/colors';
import {typography} from '../theme/typography';
import {useAuth} from '../state/AuthContext';
import {PrimaryButton} from '../components/PrimaryButton';
import {PasswordField} from '../components/PasswordField';
import {TextField} from '../components/TextField';
import {TextLink} from '../components/TextLink';
import type {RootStackParamList} from '../navigation/RootNavigator';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Login'>;

export function LoginScreen(): React.ReactElement {
  const {login, isLoggingIn} = useAuth();
  const navigation = useNavigation<Nav>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  // Credenciales incorrectas, bloqueo por intentos o sin conexión: el mensaje viene de mensajeError.
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = async () => {
    const nextEmailError = ForgotPasswordRequestSchema.safeParse({email}).success ? null : 'Ingresa un correo válido.';
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
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.logoWrap}>
          <Image
            source={require('../assets/logo2.png')}
            style={styles.logo}
            resizeMode="contain"
            accessibilityLabel="T-Ssera Construcciones"
          />
        </View>

        <View style={styles.form}>
          <Text style={[typography.h1, styles.title]} accessibilityRole="header">
            Bienvenido de vuelta
          </Text>

          <TextField
            label="Correo"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            keyboardType="email-address"
            textContentType="username"
            placeholder="tu@empresa.com"
            error={emailError}
            editable={!isLoggingIn}
          />
          <PasswordField
            label="Contraseña"
            value={password}
            onChangeText={setPassword}
            autoComplete="password"
            textContentType="password"
            error={passwordError}
            editable={!isLoggingIn}
            onSubmitEditing={handleSubmit}
          />

          <TextLink
            label="¿Olvidaste tu contraseña?"
            onPress={() => navigation.navigate('ForgotPassword', {email: email.trim()})}
            disabled={isLoggingIn}
            style={styles.forgot}
          />

          {formError ? (
            <Text style={[typography.body, styles.formError]} accessibilityLiveRegion="polite">
              {formError}
            </Text>
          ) : null}

          <PrimaryButton label="Iniciar sesión" onPress={handleSubmit} loading={isLoggingIn} style={styles.submit} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.hueso},
  scroll: {flexGrow: 1},
  logoWrap: {height: 180, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.lima},
  logo: {width: 140, height: 140},
  form: {flex: 1, padding: 24, gap: 14},
  title: {color: colors.negro, marginBottom: 8},
  forgot: {alignSelf: 'flex-end'},
  formError: {color: colors.terracota},
  submit: {marginTop: 8},
});
