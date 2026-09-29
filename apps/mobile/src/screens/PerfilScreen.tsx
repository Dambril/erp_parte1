import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {HealthApp} from '@erp/ui';
import {colors} from '../theme/colors';
import {typography} from '../theme/typography';
import {useAuth} from '../state/AuthContext';
import {PrimaryButton} from '../components/PrimaryButton';
import {apiClient} from '../lib/apiClient';

export function PerfilScreen(): React.ReactElement {
  const {user, logout} = useAuth();

  return (
    <View style={styles.screen}>
      <View style={styles.card}>
        <Text style={[typography.h2, styles.nombre]}>{user?.nombre ?? 'Invitado'}</Text>
        <Text style={[typography.body, styles.email]}>{user?.email}</Text>
      </View>

      <PrimaryButton label="Cerrar sesión" variant="secondary" onPress={() => logout()} />

      <View style={styles.diagnostico}>
        <Text style={[typography.label, styles.diagnosticoLabel]}>Estado de la API</Text>
        <HealthApp client={apiClient} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.hueso,
    padding: 20,
    gap: 20,
  },
  card: {
    backgroundColor: colors.blanco,
    borderWidth: 1,
    borderColor: colors.linea,
    borderRadius: 12,
    padding: 16,
  },
  nombre: {
    color: colors.negro,
  },
  email: {
    color: colors.piedra,
    marginTop: 4,
  },
  diagnostico: {
    marginTop: 'auto',
    gap: 6,
  },
  diagnosticoLabel: {
    color: colors.piedra,
    textTransform: 'uppercase',
  },
});
