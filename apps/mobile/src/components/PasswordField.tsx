import React, {useState} from 'react';
import {StyleSheet, Text, TouchableOpacity, type TextInputProps} from 'react-native';
import {colors} from '../theme/colors';
import {typography} from '../theme/typography';
import {TextField} from './TextField';

interface Props extends Omit<TextInputProps, 'secureTextEntry'> {
  label: string;
  error?: string | null;
  hint?: string;
}

/** Campo de contraseña con botón para mostrarla u ocultarla. */
export function PasswordField(props: Props): React.ReactElement {
  const [visible, setVisible] = useState(false);
  return (
    <TextField
      autoCapitalize="none"
      autoCorrect={false}
      {...props}
      secureTextEntry={!visible}
      rightAccessory={
        <TouchableOpacity
          onPress={() => setVisible((current) => !current)}
          accessibilityRole="button"
          accessibilityLabel={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          hitSlop={8}
          style={styles.toggle}>
          <Text style={[typography.label, styles.toggleText]}>{visible ? 'Ocultar' : 'Mostrar'}</Text>
        </TouchableOpacity>
      }
    />
  );
}

const styles = StyleSheet.create({
  toggle: {paddingHorizontal: 14, paddingVertical: 12},
  toggleText: {color: colors.verdeBosqueClaro},
});
