import React from 'react';
import {
  Image,
  Platform,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import {ApiClient} from '@erp/api-client';
import {HealthApp} from '@erp/ui';

// Builds de desarrollo (__DEV__): API local; el emulador de Android ve el localhost del PC en 10.0.2.2.
// Builds release: la API desplegada en Render.
const PRODUCTION_API_URL = 'https://erp-api-305o.onrender.com';
const DEVELOPMENT_API_URL =
  Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000';
const baseUrl = __DEV__ ? DEVELOPMENT_API_URL : PRODUCTION_API_URL;
const client = new ApiClient({baseUrl});

// El PNG es de 2000x2000 con mucho margen alrededor; se amplía y se recorta al centro.
const LOGO_BACKGROUND = '#C1FF72';
const LOGO_ZOOM = 1.7;

export default function App(): React.JSX.Element {
  const {width} = useWindowDimensions();

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar backgroundColor={LOGO_BACKGROUND} barStyle="dark-content" />
      <View style={[styles.logoFrame, {height: width * 0.9}]}>
        <Image
          source={require('./src/assets/logo1.png')}
          style={{width: width * LOGO_ZOOM, height: width * LOGO_ZOOM}}
          resizeMode="contain"
          accessibilityLabel="T-SSERA Construcciones"
        />
      </View>
      <View style={styles.status}>
        <Text style={styles.statusLabel}>Estado de la API</Text>
        <HealthApp client={client} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: LOGO_BACKGROUND,
  },
  logoFrame: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  status: {
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  statusLabel: {
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: '#000',
    opacity: 0.6,
    marginBottom: 4,
  },
});
