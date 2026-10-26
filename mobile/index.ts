import React, { useEffect, useState } from 'react';
import { registerRootComponent } from 'expo';
import * as SplashScreen from 'expo-splash-screen';

// Defines the background job that saves queued shared photos (WorkManager).
import './src/share/shareQueueTask';
import { loadLanguage } from './src/i18n';

// Held until App has fonts, theme and language (App hides it).
SplashScreen.preventAutoHideAsync().catch(() => {});

// The app itself is required only after the saved language is read, so
// module-level values that depend on it -- the body font (BODY_KR in
// themes.ts: the system font for Japanese/Chinese) -- see the right one.
// The splash screen stays up meanwhile (App hides it).
function Boot() {
  const [App, setApp] = useState<React.ComponentType | null>(null);
  useEffect(() => {
    loadLanguage().finally(() => setApp(() => require('./App').default));
  }, []);
  return App ? React.createElement(App) : null;
}

// registerRootComponent calls AppRegistry.registerComponent('main', () => Boot);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(Boot);
