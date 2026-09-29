/**
 * @format
 */

import 'react-native-gesture-handler'; // debe ser el primer import del bundle
import {AppRegistry} from 'react-native';
import App from './App';
import {name as appName} from './app.json';

AppRegistry.registerComponent(appName, () => App);
