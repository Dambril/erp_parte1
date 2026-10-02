import React from 'react';
import {ActivityIndicator, StyleSheet, Text, View} from 'react-native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {colors} from '../theme/colors';
import {typography} from '../theme/typography';
import {useAuth} from '../state/AuthContext';
import {PrimaryButton} from '../components/PrimaryButton';
import {CheckEmailScreen} from '../screens/CheckEmailScreen';
import {ForgotPasswordScreen} from '../screens/ForgotPasswordScreen';
import {LoginScreen} from '../screens/LoginScreen';
import {ObraDetailScreen} from '../screens/ObraDetailScreen';
import {MainTabs} from './MainTabs';

export type RootStackParamList = {
  Login: undefined;
  ForgotPassword: {email?: string} | undefined;
  CheckEmail: {email: string};
  Main: undefined;
  ObraDetail: {obraId: string};
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator(): React.ReactElement {
  const {status, retry} = useAuth();

  if (status === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.negro} />
      </View>
    );
  }

  if (status === 'offline') {
    // Hay sesión guardada pero no se pudo validar: no se pierde, se reintenta al volver la red.
    return (
      <View style={[styles.center, styles.offline]}>
        <Text style={[typography.h2, styles.offlineTitle]}>Sin conexión</Text>
        <Text style={[typography.body, styles.offlineText]}>Revisa tu internet e inténtalo de nuevo.</Text>
        <PrimaryButton label="Reintentar" onPress={retry} />
      </View>
    );
  }

  return (
    <Stack.Navigator screenOptions={{headerStyle: {backgroundColor: colors.blanco}, headerTintColor: colors.negro}}>
      {status === 'signedIn' ? (
        <>
          <Stack.Screen name="Main" component={MainTabs} options={{headerShown: false}} />
          <Stack.Screen name="ObraDetail" component={ObraDetailScreen} options={{title: 'Detalle de propuesta'}} />
        </>
      ) : (
        <>
          <Stack.Screen name="Login" component={LoginScreen} options={{headerShown: false}} />
          <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} options={{title: ''}} />
          <Stack.Screen name="CheckEmail" component={CheckEmailScreen} options={{title: ''}} />
        </>
      )}
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  center: {flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.hueso},
  offline: {padding: 24, gap: 12, alignItems: 'stretch'},
  offlineTitle: {color: colors.negro, textAlign: 'center'},
  offlineText: {color: colors.piedra, textAlign: 'center', marginBottom: 8},
});
