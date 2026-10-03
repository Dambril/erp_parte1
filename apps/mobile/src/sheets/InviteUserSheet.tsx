import React, {useEffect, useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {colors} from '@erp/ui';
import {AssignableRoleSchema, InviteUserRequestSchema, ROLE_LABEL, type AssignableRole, type InviteUserResponse} from '@erp/domain';
import {ApiError, erroresPorCampo, mensajeError} from '@erp/api-client';
import {typography} from '../theme/typography';
import {useConstruction} from '../state/ConstructionContext';
import {apiClient} from '../lib/apiClient';
import {BottomSheet} from '../components/BottomSheet';
import {Notice} from '../components/Card';
import {FilterChip} from '../components/FilterChip';
import {PrimaryButton} from '../components/PrimaryButton';
import {TextField} from '../components/TextField';

type Field = 'name' | 'email' | 'role';

interface Props {
  visible: boolean;
  onClose: () => void;
  onInvited: (result: InviteUserResponse) => void;
}

export function InviteUserSheet({visible, onClose, onInvited}: Props): React.ReactElement {
  const {refresh} = useConstruction();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<AssignableRole | null>(null);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setName('');
    setEmail('');
    setRole(null);
    setErrors({});
    setNotice(null);
  }, [visible]);

  const send = async () => {
    setNotice(null);
    const parsed = InviteUserRequestSchema.safeParse({name, email, role: role ?? undefined});
    if (!parsed.success) {
      const found: Partial<Record<Field, string>> = {};
      for (const issue of parsed.error.issues) found[issue.path[0] as Field] ??= issue.path[0] === 'role' ? 'Elige un rol' : issue.message;
      setErrors(found);
      return;
    }
    setBusy(true);
    try {
      const result = await apiClient.users.invite(parsed.data);
      refresh();
      onInvited(result);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'EMAIL_IN_USE') setErrors({email: mensajeError(error)});
      else {
        setErrors(erroresPorCampo(error));
        setNotice(mensajeError(error));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet visible={visible} title="Invitar" onClose={onClose}>
      <TextField label="Nombre" value={name} onChangeText={setName} maxLength={200} error={errors.name} />
      <TextField
        label="Correo"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        error={errors.email}
      />
      <View style={styles.roles}>
        <Text style={[typography.label, styles.label]}>Rol</Text>
        <View style={styles.chips}>
          {AssignableRoleSchema.options.map((option) => (
            <FilterChip key={option} label={ROLE_LABEL[option]} active={role === option} onPress={() => setRole(option)} />
          ))}
        </View>
        {errors.role ? <Text style={[typography.bodySmall, styles.error]}>{errors.role}</Text> : null}
      </View>
      <Text style={[typography.bodySmall, styles.muted]}>Le enviaremos un enlace para crear su contraseña. Vence en 7 días.</Text>
      {notice ? <Notice text={notice} tone="error" /> : null}
      <PrimaryButton label="Enviar invitación" onPress={() => void send()} loading={busy} />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  roles: {gap: 6},
  label: {color: colors.stone, textTransform: 'uppercase', letterSpacing: 0.4},
  chips: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  error: {color: colors.danger},
  muted: {color: colors.inkSecondary},
});
