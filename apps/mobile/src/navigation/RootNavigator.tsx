import React from 'react';
import {ActivityIndicator, View} from 'react-native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {colors} from '../theme/colors';
import {useAuth} from '../state/AuthContext';
import {LoginScreen} from '../screens/LoginScreen';
import {ObraDetailScreen} from '../screens/ObraDetailScreen';
import {MainTabs} from './MainTabs';

export type RootStackParamList = {
  Login: undefined;
  Main: undefined;
  ObraDetail: {obraId: string};
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator(): React.ReactElement {
  const {user, isLoadingSession} = useAuth();

  if (isLoadingSession) {
    return (
      <View style={{flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.hueso}}>
        <ActivityIndicator color={colors.negro} />
      </View>
    );
  }

  return (
    <Stack.Navigator screenOptions={{headerStyle: {backgroundColor: colors.blanco}, headerTintColor: colors.negro}}>
      {user ? (
        <>
          <Stack.Screen name="Main" component={MainTabs} options={{headerShown: false}} />
          <Stack.Screen
            name="ObraDetail"
            component={ObraDetailScreen}
            options={{title: 'Detalle de propuesta'}}
          />
        </>
      ) : (
        <Stack.Screen name="Login" component={LoginScreen} options={{headerShown: false}} />
      )}
    </Stack.Navigator>
  );
}
