import React, {useState} from 'react';
import {ScrollView, StyleSheet, Text, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {colors} from '@erp/ui';
import {AssignableRoleSchema, ROLE_LABEL, USER_STATUS_LABEL, type AssignableRole, type PublicUser} from '@erp/domain';
import {typography} from '../theme/typography';
import {roleTone, userStatusTone} from '../theme/users';
import {useAuth} from '../state/AuthContext';
import {useSubmit} from '../hooks/useSubmit';
import {apiClient} from '../lib/apiClient';
import {Avatar} from '../components/Avatar';
import {Card, Notice} from '../components/Card';
import {ConfirmSheet} from '../components/ConfirmSheet';
import {FilterChip} from '../components/FilterChip';
import {PrimaryButton} from '../components/PrimaryButton';
import {StatusBadge} from '../components/StatusBadge';
import type {RootStackParamList} from '../navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'UserDetail'>;

const isAssignable = (role: string): role is AssignableRole => (AssignableRoleSchema.options as string[]).includes(role);

/**
 * La API no tiene un `GET /users/:id`: el detalle parte del usuario de la lista y se actualiza con la
 * respuesta de cada acción. No existe eliminar usuario; se desactiva el acceso y el historial se conserva.
 */
export function UserDetailScreen({route}: Props): React.ReactElement {
  const {user: me} = useAuth();
  const [user, setUser] = useState<PublicUser>(route.params.user);
  const [role, setRole] = useState<string>(route.params.user.role);
  const [confirm, setConfirm] = useState<'deactivate' | 'reactivate' | null>(null);
  const [notice, setNotice] = useState<{text: string; tone: 'muted' | 'error'} | null>(null);
  const roleChange = useSubmit();
  const access = useSubmit();
  const resend = useSubmit();

  const isMe = me?.id === user.id;
  const done = (text: string) => (updated: PublicUser) => {
    setUser(updated);
    setRole(updated.role);
    setNotice({text, tone: 'muted'});
  };

  const saveRole = () => {
    if (!isAssignable(role)) return;
    setNotice(null);
    void roleChange.submit(() => apiClient.users.changeRole(user.id, role), done(`Ahora es ${ROLE_LABEL[role]}.`));
  };

  const changeAccess = () => {
    const deactivating = confirm === 'deactivate';
    void access.submit(
      () => (deactivating ? apiClient.users.deactivate(user.id) : apiClient.users.reactivate(user.id)),
      (updated) => {
        setConfirm(null);
        done(deactivating ? 'Se desactivó el acceso y se cerraron sus sesiones.' : 'Se reactivó el acceso.')(updated);
      },
    );
  };

  const resendInvitation = () => {
    setNotice(null);
    void resend.submit(
      () => apiClient.users.resendInvitation(user.id),
      ({emailSent}) =>
        setNotice(
          emailSent
            ? {text: `Enviamos un enlace nuevo a ${user.email}. El anterior ya no sirve.`, tone: 'muted'}
            : {text: 'Se generó un enlace nuevo, pero el correo no salió. Inténtalo de nuevo.', tone: 'error'},
        ),
    );
  };

  // `LAST_ADMIN` y los demás rechazos de la API llegan ya redactados por `useSubmit`.
  const actionError = roleChange.error ?? resend.error;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.identity}>
        <Avatar name={user.name} size={64} />
        <View style={styles.identityText}>
          <Text style={[typography.h2, styles.text]}>{user.name}</Text>
          <Text style={[typography.body, styles.muted]}>{user.email}</Text>
          <View style={styles.badges}>
            <StatusBadge label={ROLE_LABEL[user.role]} tone={roleTone(user.role)} />
            <StatusBadge label={USER_STATUS_LABEL[user.status]} tone={userStatusTone[user.status]} />
          </View>
        </View>
      </View>

      {notice ? <Notice text={notice.text} tone={notice.tone} /> : null}
      {actionError ? <Notice text={actionError} tone="error" /> : null}

      <Card title="Rol">
        <View style={styles.chips}>
          {AssignableRoleSchema.options.map((option) => (
            <FilterChip key={option} label={ROLE_LABEL[option]} active={role === option} onPress={() => setRole(option)} />
          ))}
        </View>
        {!isAssignable(user.role) ? (
          <Text style={[typography.bodySmall, styles.muted]}>Su rol actual ({ROLE_LABEL[user.role]}) no se asigna desde aquí.</Text>
        ) : null}
        <PrimaryButton
          label="Guardar rol"
          onPress={saveRole}
          loading={roleChange.busy}
          disabled={role === user.role || !isAssignable(role)}
        />
      </Card>

      {user.status === 'invited' ? (
        <Card title="Invitación pendiente">
          <Text style={[typography.body, styles.muted]}>Aún no crea su contraseña. Puedes enviarle un enlace nuevo.</Text>
          <PrimaryButton label="Reenviar invitación" variant="secondary" onPress={resendInvitation} loading={resend.busy} />
        </Card>
      ) : null}

      <Card title="Acceso">
        {user.status === 'deactivated' ? (
          <PrimaryButton label="Reactivar acceso" variant="secondary" onPress={() => setConfirm('reactivate')} />
        ) : (
          <PrimaryButton label="Desactivar acceso" variant="secondary" onPress={() => setConfirm('deactivate')} />
        )}
        <Text style={[typography.bodySmall, styles.muted]}>Los usuarios no se eliminan: su historial se conserva.</Text>
      </Card>

      <ConfirmSheet
        visible={confirm !== null}
        title={confirm === 'deactivate' ? 'Desactivar acceso' : 'Reactivar acceso'}
        message={
          confirm === 'deactivate'
            ? `${user.name} ya no podrá entrar y se cerrarán todas sus sesiones.${isMe ? ' Es tu propia cuenta: saldrás de la app.' : ''}`
            : `${user.name} podrá volver a entrar${user.status === 'deactivated' ? ' con su contraseña' : ''}.`
        }
        confirmLabel={confirm === 'deactivate' ? 'Desactivar' : 'Reactivar'}
        busy={access.busy}
        error={access.error}
        onClose={() => setConfirm(null)}
        onConfirm={changeAccess}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.bone},
  content: {padding: 20, gap: 16},
  identity: {flexDirection: 'row', gap: 14, alignItems: 'center'},
  identityText: {flex: 1, gap: 2},
  badges: {flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 6},
  chips: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  text: {color: colors.ink},
  muted: {color: colors.inkSecondary},
});
