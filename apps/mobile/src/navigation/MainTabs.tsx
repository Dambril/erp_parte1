import React from 'react';
import {Text} from 'react-native';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {colors} from '../theme/colors';
import {DashboardScreen} from '../screens/DashboardScreen';
import {ObrasScreen} from '../screens/ObrasScreen';
import {PerfilScreen} from '../screens/PerfilScreen';

export type MainTabsParamList = {
  Dashboard: undefined;
  Obras: undefined;
  Perfil: undefined;
};

const Tab = createBottomTabNavigator<MainTabsParamList>();

const ICONS: Record<keyof MainTabsParamList, string> = {
  Dashboard: '⌂', // casa
  Obras: '\u{1F3D7}', // grúa/construcción
  Perfil: '\u{1F464}', // persona
};

export function MainTabs(): React.ReactElement {
  return (
    <Tab.Navigator
      screenOptions={({route}) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.negro,
        tabBarInactiveTintColor: colors.piedra,
        tabBarActiveBackgroundColor: colors.lima,
        tabBarStyle: {backgroundColor: colors.blanco, borderTopColor: colors.linea},
        tabBarIcon: ({color}) => (
          <Text style={{fontSize: 18, color}}>{ICONS[route.name as keyof MainTabsParamList]}</Text>
        ),
      })}>
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      <Tab.Screen name="Obras" component={ObrasScreen} />
      <Tab.Screen name="Perfil" component={PerfilScreen} />
    </Tab.Navigator>
  );
}
