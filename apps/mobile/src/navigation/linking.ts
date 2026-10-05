import type {LinkingOptions} from '@react-navigation/native';
import type {RootStackParamList} from './RootNavigator';

// La app nativa no abre enlaces: los de los correos apuntan a la web (ver `linking.web.ts`).
export const linking: LinkingOptions<RootStackParamList> | undefined = undefined;
