import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { supabase } from './supabase';

// Kakao rejects the whole login with KOE205 ("설정하지 않은 동의 항목") if the
// requested scope includes anything beyond what's configured in 동의항목 --
// Supabase's Kakao provider asks for account_email by default, which we
// deliberately left off (see the "이메일은 일단 빼고" call), so it must be
// pinned here to only what's actually enabled.
const KAKAO_SCOPES = 'profile_nickname profile_image';

// Web: signInWithOAuth does a full-page redirect to Kakao and back; the
// client's detectSessionInUrl (see supabase.ts) picks up the returned
// ?code=... automatically once this page reloads, so there's nothing more
// to do here on that path.
//
// Native: there's no "current page" to redirect within, so the OAuth URL
// opens in a system browser tab (WebBrowser.openAuthSessionAsync) and Kakao
// redirects back to this app via its own URL scheme (app.json's "scheme":
// "cortex") instead of an https URL. That redirect carries the same
// ?code=..., which exchangeCodeForSession turns into a session manually.
export async function signInWithKakao(): Promise<void> {
  if (Platform.OS === 'web') {
    const redirectTo = `${window.location.origin}/cortex/`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'kakao',
      options: { redirectTo, scopes: KAKAO_SCOPES },
    });
    if (error) throw error;
    return;
  }

  const redirectTo = Linking.createURL('auth-callback');
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'kakao',
    options: { redirectTo, scopes: KAKAO_SCOPES, skipBrowserRedirect: true },
  });
  if (error) throw error;
  if (!data.url) throw new Error('카카오 로그인 URL을 받지 못했어요');

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success' || !result.url) {
    throw new Error('로그인이 취소됐어요');
  }

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(result.url);
  if (exchangeError) throw exchangeError;
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}
