import React from 'react';
import {Text} from 'react-native';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {colors as tokens} from '@erp/ui';
import {colors} from '../theme/colors';
import {useAuth} from '../state/AuthContext';
import {useResource} from '../hooks/useResource';
import {apiClient} from '../lib/apiClient';
import {DashboardScreen} from '../screens/DashboardScreen';
import {ProjectsScreen} from '../screens/ProjectsScreen';
import {ProposalsScreen} from '../screens/ProposalsScreen';
import {PerfilScreen} from '../screens/PerfilScreen';

export type MainTabsParamList = {
  Dashboard: undefined;
  Obras: undefined;
  Propuestas: undefined;
  Perfil: undefined;
};

const Tab = createBottomTabNavigator<MainTabsParamList>();

const ICONS: Record<keyof MainTabsParamList, string> = {
  Dashboard: '⌂', // casa
  Obras: '\u{1F3D7}', // grúa/construcción
  Propuestas: '\u{1F4C4}', // documento
  Perfil: '\u{1F464}', // persona
};

export function MainTabs(): React.ReactElement {
  const {can} = useAuth();
  // Contador de propuestas por decidir: solo para quien puede aprobarlas.
  const canDecide = can('construction.proposals:approve');
  const inReview = useResource(
    () => apiClient.construction.proposals.list({status: 'in_review', pageSize: 1}),
    'proposals-in-review-count',
    canDecide,
  );
  const pending = inReview.data?.total ?? 0;

  return (
    <Tab.Navigator
      screenOptions={({route}) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.negro,
        tabBarInactiveTintColor: tokens.inkSecondary,
        tabBarActiveBackgroundColor: colors.lima,
        tabBarStyle: {backgroundColor: colors.blanco, borderTopColor: colors.linea},
        tabBarIcon: ({color}) => (
          <Text style={{fontSize: 18, color}}>{ICONS[route.name as keyof MainTabsParamList]}</Text>
        ),
      })}>
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      <Tab.Screen name="Obras" component={ProjectsScreen} />
      <Tab.Screen
        name="Propuestas"
        component={ProposalsScreen}
        options={{
          tabBarBadge: canDecide && pending > 0 ? pending : undefined,
          tabBarBadgeStyle: {backgroundColor: tokens.forest, color: tokens.white},
        }}
      />
      <Tab.Screen name="Perfil" component={PerfilScreen} />
    </Tab.Navigator>
  );
}
