import React from 'react';
import {StyleSheet, Text, TouchableOpacity} from 'react-native';
import {colors, radii, touchTarget} from '@erp/ui';
import {typography} from '../theme/typography';
import {BottomSheet} from './BottomSheet';

export interface MenuAction {
  label: string;
  onPress: () => void;
  /** Acción destructiva (eliminar): se pinta en `danger`. */
  danger?: boolean;
}

/** Botón "⋯" con área táctil de 44×44. */
export function MoreButton({onPress, label}: {onPress: () => void; label: string}): React.ReactElement {
  return (
    <TouchableOpacity onPress={onPress} style={styles.more} accessibilityRole="button" accessibilityLabel={label} hitSlop={4}>
      <Text style={styles.moreText}>⋯</Text>
    </TouchableOpacity>
  );
}

interface Props {
  visible: boolean;
  title: string;
  actions: MenuAction[];
  onClose: () => void;
}

export function ActionMenu({visible, title, actions, onClose}: Props): React.ReactElement {
  return (
    <BottomSheet visible={visible} title={title} onClose={onClose}>
      {actions.map((action) => (
        <TouchableOpacity
          key={action.label}
          style={styles.action}
          accessibilityRole="button"
          onPress={() => {
            onClose();
            action.onPress();
          }}>
          <Text style={[typography.body, styles.actionText, action.danger && styles.danger]}>{action.label}</Text>
        </TouchableOpacity>
      ))}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  more: {width: touchTarget, height: touchTarget, alignItems: 'center', justifyContent: 'center', borderRadius: radii.button},
  moreText: {fontSize: 22, color: colors.stone, fontWeight: '700'},
  action: {
    minHeight: touchTarget + 4,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: radii.button,
    borderWidth: 1,
    borderColor: colors.line,
  },
  actionText: {color: colors.ink, fontWeight: '600', fontSize: 15},
  danger: {color: colors.danger},
});
