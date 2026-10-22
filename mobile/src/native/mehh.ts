import { Linking } from 'react-native';

// Mehh (Sophie's screenshot-cleanup app) shares screenshots here with this
// URL as the share text. Opening it back -- with how many were saved -- is
// Mehh's go-ahead to move its originals to the trash, so it's only called
// once every shared image is safely saved.
export const MEHH_SAVED_URL = 'mehh://cortex-saved';

export function tellMehhSaved(count: number) {
  Linking.openURL(`${MEHH_SAVED_URL}?count=${count}`).catch(() => {});
}
