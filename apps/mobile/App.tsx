import React from 'react';
import {StatusBar} from 'react-native';
import {NavigationContainer} from '@react-navigation/native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {colors} from './src/theme/colors';
import {AuthProvider} from './src/state/AuthContext';
import {ConnectivityProvider} from './src/state/ConnectivityContext';
import {ConstructionProvider} from './src/state/ConstructionContext';
import {RootNavigator} from './src/navigation/RootNavigator';
import {linking} from './src/navigation/linking';
import {SnakeGame} from './src/easterEgg/SnakeGame';

export default function App(): React.JSX.Element {
  return (
    <GestureHandlerRootView style={{flex: 1}}>
      <SafeAreaProvider>
        <StatusBar backgroundColor={colors.hueso} barStyle="dark-content" />
        <ConnectivityProvider>
          <AuthProvider>
            <ConstructionProvider>
              <NavigationContainer
                linking={linking}
                documentTitle={{formatter: (options, route) => `${options?.title ?? route?.name ?? 'Inicio'} · T-ssera`}}>
                <RootNavigator />
              </NavigationContainer>
            </ConstructionProvider>
          </AuthProvider>
        </ConnectivityProvider>
        <SnakeGame />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
