import 'react-native-gesture-handler'; // debe ser el primer import, igual que en apps/mobile/index.js
import { AppRegistry } from 'react-native';
import App from '../../mobile/App';
import './global.css';

// La web no tiene pantallas propias: monta la app de apps/mobile con React Native Web.
AppRegistry.registerComponent('TSsera', () => App);
AppRegistry.runApplication('TSsera', { rootTag: document.getElementById('root') });
