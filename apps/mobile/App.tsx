import React from 'react';
import {StatusBar} from 'react-native';
import {NavigationContainer} from '@react-navigation/native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {colors} from './src/theme/colors';
import {AuthProvider} from './src/state/AuthContext';
import {ConstructionProvider} from './src/state/ConstructionContext';
import {RootNavigator} from './src/navigation/RootNavigator';

export default function App(): React.JSX.Element {
  return (
    <GestureHandlerRootView style={{flex: 1}}>
      <SafeAreaProvider>
        <StatusBar backgroundColor={colors.hueso} barStyle="dark-content" />
        <AuthProvider>
          <ConstructionProvider>
            <NavigationContainer>
              <RootNavigator />
            </NavigationContainer>
          </ConstructionProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
