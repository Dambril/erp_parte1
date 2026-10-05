import React from 'react';
import {KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {colors, radii} from '@erp/ui';
import {typography} from '../theme/typography';

interface Props {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

/** Hoja inferior sobre `Modal`: se cierra al tocar fuera o con el botón atrás de Android. */
export function BottomSheet({visible, title, onClose, children}: Props): React.ReactElement {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Cerrar" />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={[typography.h2, styles.title]}>{title}</Text>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, justifyContent: 'flex-end'},
  backdrop: {...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(22, 21, 15, 0.45)'},
  sheet: {
    // En pantallas anchas (web) la hoja no ocupa todo el ancho.
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    maxHeight: '88%',
    backgroundColor: colors.white,
    borderTopLeftRadius: radii.card + 6,
    borderTopRightRadius: radii.card + 6,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 24,
  },
  handle: {alignSelf: 'center', width: 40, height: 4, borderRadius: radii.pill, backgroundColor: colors.line},
  title: {color: colors.ink, marginTop: 14, marginBottom: 4},
  content: {gap: 14, paddingTop: 8},
});
