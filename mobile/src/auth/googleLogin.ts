import { Platform } from 'react-native';
import { supabase } from './supabase';

// Sign in with Google.
// - Android: the phone's own Google account picker returns an ID token,
//   which Supabase verifies (its audience is the web client ID below).
// - Web: Supabase's OAuth redirect to Google and back to this page.
// A new Google account gets the same 7-day trial as Kakao (the server
// starts it when it first sees the account).

// The web OAuth client of the Google Cloud project "cortex" -- a public
// identifier, not a secret. The Android clients (one per signing key) are
// matched by package name + SHA-1, so the app never needs their IDs.
const WEB_CLIENT_ID = '5317344898-jds60oojrp66afkb01k15p6aqaljc3uk.apps.googleusercontent.com';

// Thrown when the person closes the account picker -- not an error to show.
export class GoogleSignInCancelled extends Error {
  constructor() {
    super('cancelled');
  }
}

export async function signInWithGoogle(): Promise<void> {
  if (Platform.OS === 'web') {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + window.location.pathname },
    });
    if (error) throw error;
    return;
  }

  // Native only -- the web bundle never loads this module.
  const { GoogleSignin, isErrorWithCode, isSuccessResponse, statusCodes } =
    require('@react-native-google-signin/google-signin') as typeof import('@react-native-google-signin/google-signin');
  GoogleSignin.configure({ webClientId: WEB_CLIENT_ID });
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const response = await GoogleSignin.signIn();
    if (!isSuccessResponse(response)) throw new GoogleSignInCancelled();
    const idToken = response.data.idToken;
    if (!idToken) throw new Error('Google returned no ID token');
    const { error } = await supabase.auth.signInWithIdToken({ provider: 'google', token: idToken });
    if (error) throw error;
  } catch (err) {
    if (isErrorWithCode(err) && (err.code === statusCodes.SIGN_IN_CANCELLED || err.code === statusCodes.IN_PROGRESS)) {
      throw new GoogleSignInCancelled();
    }
    throw err;
  }
}

// Also forget the Google account choice on this phone, so the next Google
// login asks which account again (Supabase's own signOut is separate).
export async function signOutOfGoogle(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const { GoogleSignin } = require('@react-native-google-signin/google-signin') as typeof import('@react-native-google-signin/google-signin');
    await GoogleSignin.signOut();
  } catch {
    // not signed in with Google on this device -- nothing to forget
  }
}
