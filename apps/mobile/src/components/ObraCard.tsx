import React from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {colors} from '../theme/colors';
import {typography} from '../theme/typography';
import type {Obra} from '../types/obra';
import {ProgressBar} from './ProgressBar';
import {StatusBadge} from './StatusBadge';

export function ObraCard({obra, onPress}: {obra: Obra; onPress: () => void}): React.ReactElement {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={[typography.h3, styles.nombre]} numberOfLines={1}>
            {obra.nombre}
          </Text>
          <Text style={[typography.bodySmall, styles.cliente]} numberOfLines={1}>
            {obra.cliente} · {obra.ubicacion}
          </Text>
        </View>
        <StatusBadge estado={obra.estado} />
      </View>
      <ProgressBar progreso={obra.progreso} />
      <View style={styles.footer}>
        <Text style={[typography.bodySmall, styles.avance]}>{obra.progreso}% avance</Text>
        {obra.certificacion ? (
          <Text style={[typography.bodySmall, styles.certificacion]}>{obra.certificacion}</Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.blanco,
    borderWidth: 1,
    borderColor: colors.linea,
    borderRadius: 12,
    padding: 14,
    gap: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  headerText: {
    flex: 1,
  },
  nombre: {
    color: colors.negro,
  },
  cliente: {
    color: colors.piedra,
    marginTop: 2,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  avance: {
    color: colors.piedra,
  },
  certificacion: {
    color: colors.verdeBosqueClaro,
    fontWeight: '600',
  },
});
