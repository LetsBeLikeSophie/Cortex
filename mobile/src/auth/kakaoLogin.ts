import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { supabase } from './supabase';
import { API_BASE_URL } from '../api/client';

// Kakao's REST API key is the public/client-facing half of the pair (like a
// standard OAuth client id) -- fine to ship in the app. The Client Secret
// stays backend-only (backend/.env), used only for the token exchange in
// backend/src/lib/kakaoAuth.ts.
const KAKAO_REST_API_KEY = '47c428c877f8177c7a07a72dc888280d';

// Deliberately narrow. Supabase's built-in Kakao provider unconditionally
// adds account_email to every request regardless of what scopes you pass it,
// and Kakao rejects the whole login (KOE205) unless that scope is an
// approved consent item -- which needs a Kakao review this app is skipping
// since it doesn't need email. Building the authorize URL by hand instead
// means only these two scopes (both already approved) ever get requested.
const KAKAO_SCOPE = 'profile_nickname profile_image';

function authorizeUrl(redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: KAKAO_REST_API_KEY,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: KAKAO_SCOPE,
  });
  return `https://kauth.kakao.com/oauth/authorize?${params.toString()}`;
}

// Trades the Kakao authorization code for a real Supabase session via our
// own backend (see backend/src/lib/kakaoAuth.ts for why this doesn't go
// through supabase-js's signInWithOAuth), then hydrates this client with it.
async function exchangeCodeForSession(code: string, redirectUri: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/auth/kakao`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, redirectUri }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`카카오 로그인 처리 실패 (${res.status}): ${body}`);
  }
  const session = await res.json();
  const { error } = await supabase.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });
  if (error) throw error;
}

function webRedirectUri(): string {
  return `${window.location.origin}/cortex/`;
}

// Called once on app start (web only, see AuthContext) -- if Kakao just
// redirected back here with ?code=..., finish the login before the login
// screen ever has a chance to flash.
export async function completePendingWebLogin(): Promise<void> {
  if (Platform.OS !== 'web') return;
  const code = new URL(window.location.href).searchParams.get('code');
  if (!code) return;

  try {
    await exchangeCodeForSession(code, webRedirectUri());
  } finally {
    // Scrub the code either way -- a spent or invalid code left sitting in
    // the URL would just fail the same way again on refresh.
    window.history.replaceState({}, '', webRedirectUri());
  }
}

export async function signInWithKakao(): Promise<void> {
  if (Platform.OS === 'web') {
    // Full-page redirect; completePendingWebLogin() picks up the trip back.
    window.location.href = authorizeUrl(webRedirectUri());
    return;
  }

  // Native: no "current page" to redirect within, so the OAuth URL opens in
  // a system browser tab and Kakao redirects back into the app via its own
  // URL scheme (app.json's "scheme": "cortex") instead of an https URL.
  // Linking.parse (not a raw URL/URLSearchParams parse) is what reliably
  // reads query params off a custom-scheme URL like this.
  const redirectUri = Linking.createURL('auth-callback');
  const result = await WebBrowser.openAuthSessionAsync(authorizeUrl(redirectUri), redirectUri);
  if (result.type !== 'success' || !result.url) {
    throw new Error('로그인이 취소됐어요');
  }
  const code = Linking.parse(result.url).queryParams?.code;
  if (typeof code !== 'string') throw new Error('카카오 인가 코드를 받지 못했어요');

  await exchangeCodeForSession(code, redirectUri);
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}
