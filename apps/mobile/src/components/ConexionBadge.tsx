import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import type {RealtimeStatus} from '@erp/api-client';
import {colors} from '../theme/colors';
import {typography} from '../theme/typography';

const LABEL: Record<RealtimeStatus, string> = {
  conectado: 'En vivo',
  conectando: 'Conectando…',
  desconectado: 'Sin conexión',
};

const COLOR: Record<RealtimeStatus, string> = {
  conectado: colors.exito,
  conectando: colors.ambar,
  desconectado: colors.terracota,
};

export function ConexionBadge({estado}: {estado: RealtimeStatus}): React.ReactElement {
  return (
    <View style={styles.row} accessibilityLabel={`Sincronización: ${LABEL[estado]}`}>
      <View style={[styles.dot, {backgroundColor: COLOR[estado]}]} />
      <Text style={[typography.bodySmall, styles.text]}>{LABEL[estado]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  text: {
    color: colors.piedra,
  },
});
