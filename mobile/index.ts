import { registerRootComponent } from 'expo';

import App from './App';
// Defines the background job that saves queued shared photos (WorkManager).
import './src/share/shareQueueTask';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
