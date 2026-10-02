import React, {useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {mensajeError} from '@erp/api-client';
import {colors} from '../theme/colors';
import {typography} from '../theme/typography';
import {PrimaryButton} from '../components/PrimaryButton';
import {TextLink} from '../components/TextLink';
import {apiClient} from '../lib/apiClient';
import type {RootStackParamList} from '../navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'CheckEmail'>;

export function CheckEmailScreen({navigation, route}: Props): React.ReactElement {
  const [resending, setResending] = useState(false);
  const [feedback, setFeedback] = useState<{text: string; error: boolean} | null>(null);

  // Repite la misma solicitud; la API responde igual exista o no la cuenta.
  const resend = async () => {
    setResending(true);
    setFeedback(null);
    try {
      await apiClient.forgotPassword(route.params.email);
      setFeedback({text: 'Te enviamos otro enlace.', error: false});
    } catch (err) {
      setFeedback({text: mensajeError(err), error: true});
    } finally {
      setResending(false);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.icon} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Text style={styles.iconText}>✉</Text>
      </View>
      <Text style={[typography.h1, styles.title]} accessibilityRole="header">
        Revisa tu correo
      </Text>
      <Text style={[typography.body, styles.text]}>
        Te enviamos un enlace para crear tu contraseña nueva. Si no lo ves, busca en la carpeta de spam.
      </Text>

      <PrimaryButton label="Volver a iniciar sesión" onPress={() => navigation.popToTop()} style={styles.button} />
      <TextLink label={resending ? 'Reenviando…' : 'Reenviar correo'} onPress={resend} disabled={resending} />
      {feedback ? (
        <Text style={[typography.bodySmall, feedback.error ? styles.error : styles.ok]} accessibilityLiveRegion="polite">
          {feedback.text}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.hueso, padding: 24, justifyContent: 'center', alignItems: 'stretch', gap: 16},
  icon: {
    alignSelf: 'center',
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.lima,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: {fontSize: 34, color: colors.negro},
  title: {color: colors.negro, textAlign: 'center'},
  text: {color: colors.piedra, textAlign: 'center'},
  button: {marginTop: 8},
  ok: {color: colors.verdeBosqueClaro, textAlign: 'center'},
  error: {color: colors.terracota, textAlign: 'center'},
});
