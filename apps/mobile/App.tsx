import React from 'react';
import {Platform, SafeAreaView} from 'react-native';
import {ApiClient} from '@erp/api-client';
import {HealthApp} from '@erp/ui';

// El emulador de Android ve el localhost del PC en 10.0.2.2
const baseUrl =
  Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000';
const client = new ApiClient({baseUrl});

export default function App(): React.JSX.Element {
  return (
    <SafeAreaView>
      <HealthApp client={client} />
    </SafeAreaView>
  );
}
