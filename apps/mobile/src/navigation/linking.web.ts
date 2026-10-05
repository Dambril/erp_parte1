import {getStateFromPath, type LinkingOptions} from '@react-navigation/native';
import type {PublicUser} from '@erp/domain';
import type {RootStackParamList} from './RootNavigator';

/**
 * Rutas de la web. `/restablecer?token=...` y `/activar?token=...` son las que arma la API en los correos
 * (`APP_WEB_URL`): el `token` de la consulta llega a la pantalla como parámetro, también al recargar.
 */
export const linking: LinkingOptions<RootStackParamList> | undefined = {
  prefixes: [],
  config: {
    initialRouteName: 'Main',
    screens: {
      Main: {screens: {Dashboard: '', Obras: 'obras', Propuestas: 'propuestas', Perfil: 'perfil'}},
      Login: 'entrar',
      ForgotPassword: 'recuperar',
      CheckEmail: 'revisa-tu-correo',
      ResetPassword: 'restablecer',
      AcceptInvitation: 'activar',
      ProjectDetail: 'obras/:projectId',
      ProjectEdit: 'obras/:projectId/editar',
      ProposalDetail: 'propuestas/:proposalId',
      ProposalForm: 'propuesta',
      ChangePassword: 'perfil/contrasena',
      Users: 'usuarios',
      // El usuario viaja como objeto (la API no tiene `GET /users/:id`): en la URL solo queda su id.
      UserDetail: {path: 'usuarios/detalle', stringify: {user: (user: PublicUser) => user.id}},
      Trash: 'papelera',
    },
  },
  // Al recargar en el detalle de un usuario no hay de dónde recuperar el objeto: se vuelve a la lista.
  getStateFromPath: (path, options) => getStateFromPath(path.startsWith('/usuarios/detalle') ? '/usuarios' : path, options),
};
