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
import {ProjectDetailScreen} from '../screens/ProjectDetailScreen';
import {ProjectEditScreen} from '../screens/ProjectEditScreen';
import {ProposalDetailScreen} from '../screens/ProposalDetailScreen';
import {ProposalFormScreen} from '../screens/ProposalFormScreen';
import {ChangePasswordScreen} from '../screens/ChangePasswordScreen';
import {TrashScreen} from '../screens/TrashScreen';
import {UserDetailScreen} from '../screens/UserDetailScreen';
import {UsersScreen} from '../screens/UsersScreen';
import type {PublicUser} from '@erp/domain';
import {MainTabs} from './MainTabs';

export type RootStackParamList = {
  Login: undefined;
  ForgotPassword: {email?: string} | undefined;
  CheckEmail: {email: string};
  Main: undefined;
  ProjectDetail: {projectId: string};
  ProjectEdit: {projectId: string};
  ProposalDetail: {proposalId: string};
  /** Sin `proposalId` crea una propuesta nueva. */
  ProposalForm: {proposalId?: string} | undefined;
  ChangePassword: undefined;
  Users: undefined;
  /** El usuario viene de la lista: la API no tiene `GET /users/:id`. */
  UserDetail: {user: PublicUser};
  Trash: undefined;
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
          <Stack.Screen name="ProjectDetail" component={ProjectDetailScreen} options={{title: 'Detalle de obra'}} />
          <Stack.Screen name="ProjectEdit" component={ProjectEditScreen} options={{title: 'Editar obra'}} />
          <Stack.Screen name="ProposalDetail" component={ProposalDetailScreen} options={{title: 'Detalle de propuesta'}} />
          <Stack.Screen name="ProposalForm" component={ProposalFormScreen} options={{title: 'Nueva propuesta'}} />
          <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} options={{title: 'Cambiar contraseña'}} />
          <Stack.Screen name="Users" component={UsersScreen} options={{title: 'Usuarios'}} />
          <Stack.Screen name="UserDetail" component={UserDetailScreen} options={{title: 'Usuario'}} />
          <Stack.Screen name="Trash" component={TrashScreen} options={{title: 'Papelera'}} />
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
