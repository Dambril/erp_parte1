import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {HealthApp} from '@erp/ui';
import {ROLE_LABEL} from '@erp/domain';
import {colors} from '../theme/colors';
import {typography} from '../theme/typography';
import {useAuth} from '../state/AuthContext';
import {useObras} from '../state/ObrasContext';
import {PrimaryButton} from '../components/PrimaryButton';
import {ConexionBadge} from '../components/ConexionBadge';
import {apiClient} from '../lib/apiClient';

export function PerfilScreen(): React.ReactElement {
  const {user, logout} = useAuth();
  const {conexion} = useObras();

  return (
    <View style={styles.screen}>
      <View style={styles.card}>
        <Text style={[typography.h2, styles.nombre]}>{user?.name}</Text>
        <Text style={[typography.body, styles.muted]}>{user?.email}</Text>
        {user ? <Text style={[typography.bodySmall, styles.rol]}>{ROLE_LABEL[user.role]}</Text> : null}
      </View>

      <PrimaryButton label="Cerrar sesión" variant="secondary" onPress={() => logout()} />

      <View style={styles.diagnostico}>
        <Text style={[typography.label, styles.diagnosticoLabel]}>Sincronización</Text>
        <ConexionBadge estado={conexion} />
        <Text style={[typography.label, styles.diagnosticoLabel]}>Estado de la API</Text>
        <HealthApp client={apiClient} />
        <Text style={[typography.bodySmall, styles.muted]}>{apiClient.baseUrl}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.hueso, padding: 20, gap: 20},
  card: {
    backgroundColor: colors.blanco,
    borderWidth: 1,
    borderColor: colors.linea,
    borderRadius: 12,
    padding: 16,
    gap: 4,
  },
  nombre: {color: colors.negro},
  muted: {color: colors.piedra},
  rol: {color: colors.verdeBosqueClaro, fontWeight: '600', marginTop: 4},
  diagnostico: {marginTop: 'auto', gap: 6},
  diagnosticoLabel: {color: colors.piedra, textTransform: 'uppercase'},
});
