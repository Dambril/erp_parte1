import React, {useState} from 'react';
import {ScrollView, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {useNavigation} from '@react-navigation/native';
import {colors, radii, touchTarget} from '@erp/ui';
import {ROLE_LABEL, UpdateProfileRequestSchema} from '@erp/domain';
import {mensajeError} from '@erp/api-client';
import {typography} from '../theme/typography';
import {useAuth} from '../state/AuthContext';
import {apiClient} from '../lib/apiClient';
import {Avatar} from '../components/Avatar';
import {Card, Notice} from '../components/Card';
import {PrimaryButton} from '../components/PrimaryButton';
import {TextField} from '../components/TextField';
import {TextLink} from '../components/TextLink';
import type {RootStackParamList} from '../navigation/RootNavigator';
import {useSecretTaps} from '../easterEgg/trigger';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function PerfilScreen(): React.ReactElement {
  const {user, company, can, logout} = useAuth();
  const navigation = useNavigation<Nav>();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const secretTaps = useSecretTaps();

  if (!user) return <View style={styles.screen} />;

  const startEditing = () => {
    setName(user.name);
    setError(null);
    setEditing(true);
  };

  const saveName = async () => {
    const parsed = UpdateProfileRequestSchema.safeParse({name});
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Escribe tu nombre');
      return;
    }
    setSaving(true);
    try {
      // El cliente avisa a la sesión: el nombre cambia también en el Dashboard.
      await apiClient.updateProfile(parsed.data.name);
      setEditing(false);
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setSaving(false);
    }
  };

  const canManageUsers = can('identity.users:manage');
  const canUseTrash = can('construction.projects:restore') || can('construction.proposals:restore');

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={[typography.h1, styles.title]}>Perfil</Text>

      <Card>
        <View style={styles.identity}>
          <View {...secretTaps}>
            <Avatar name={user.name} size={64} />
          </View>
          <View style={styles.identityText}>
            {editing ? null : (
              <Text style={[typography.h2, styles.title]} numberOfLines={2}>
                {user.name}
              </Text>
            )}
            <Text style={[typography.body, styles.muted]}>{user.email}</Text>
          </View>
        </View>
        {editing ? (
          <>
            <TextField label="Nombre" value={name} onChangeText={setName} maxLength={200} error={error} autoFocus />
            <View style={styles.row}>
              <PrimaryButton label="Cancelar" variant="secondary" onPress={() => setEditing(false)} disabled={saving} style={styles.flex} />
              <PrimaryButton label="Guardar" onPress={() => void saveName()} loading={saving} style={styles.flex} />
            </View>
          </>
        ) : can('identity.profile:update') ? (
          <TextLink label="Editar nombre" onPress={startEditing} style={styles.left} />
        ) : null}
        <Field label="Empresa" value={company?.name ?? ''} />
        <Field label="Rol" value={ROLE_LABEL[user.role]} />
      </Card>

      <View style={styles.section}>
        {can('identity.profile:update') ? (
          <Option label="Cambiar contraseña" onPress={() => navigation.navigate('ChangePassword')} />
        ) : null}
        <Option label="Cerrar sesión" onPress={() => void logout()} />
      </View>

      {canManageUsers || canUseTrash ? (
        <View style={styles.section}>
          <Text style={[typography.label, styles.sectionTitle]}>Administración</Text>
          {canManageUsers ? <Option label="Usuarios" onPress={() => navigation.navigate('Users')} /> : null}
          {canUseTrash ? <Option label="Papelera" onPress={() => navigation.navigate('Trash')} /> : null}
        </View>
      ) : null}
      {error && !editing ? <Notice text={error} tone="error" /> : null}
    </ScrollView>
  );
}

function Field({label, value}: {label: string; value: string}): React.ReactElement {
  return (
    <View style={styles.field}>
      <Text style={[typography.label, styles.fieldLabel]}>{label}</Text>
      <Text style={[typography.body, styles.title]}>{value}</Text>
    </View>
  );
}

function Option({label, onPress}: {label: string; onPress: () => void}): React.ReactElement {
  return (
    <TouchableOpacity style={styles.option} onPress={onPress} accessibilityRole="button" activeOpacity={0.7}>
      <Text style={[typography.body, styles.optionText]}>{label}</Text>
      <Text style={styles.chevron}>›</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.bone},
  content: {padding: 20, gap: 16},
  title: {color: colors.ink},
  muted: {color: colors.inkSecondary},
  identity: {flexDirection: 'row', alignItems: 'center', gap: 14},
  identityText: {flex: 1, gap: 2},
  row: {flexDirection: 'row', gap: 12},
  flex: {flex: 1},
  left: {alignSelf: 'flex-start'},
  field: {gap: 2},
  fieldLabel: {color: colors.stone, textTransform: 'uppercase', letterSpacing: 0.4},
  section: {gap: 8},
  sectionTitle: {color: colors.inkSecondary, textTransform: 'uppercase', letterSpacing: 0.4},
  option: {
    minHeight: touchTarget + 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.card,
  },
  optionText: {color: colors.ink, fontWeight: '600'},
  chevron: {fontSize: 22, color: colors.stone},
});
