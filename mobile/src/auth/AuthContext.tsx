import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { refreshDetached, supabase } from './supabase';
import { completePendingWebLogin } from './kakaoLogin';
import { ApiError, claimGuest, fetchRecentItems, seedSampleItem } from '../api/client';
import { moveGuestTabs } from '../data/tabs';
import { showToast } from '../native/toast';
import { strings } from '../i18n';
import AsyncStorage from '@react-native-async-storage/async-storage';

const S = strings({
  ko: { claimLater: '게스트 메모를 아직 못 옮겼어요 · 앱을 다시 열면 이어서 옮겨요' },
  en: { claimLater: "Guest memos aren't moved yet · they'll move when you reopen the app" },
  ja: { claimLater: 'ゲストのメモはまだ移せていません · アプリを開き直すと続きを移します' },
  'zh-Hans': { claimLater: '访客笔记还没转移 · 重新打开应用会继续' },
  'zh-Hant': { claimLater: '訪客筆記還沒轉移 · 重新開啟 App 會繼續' },
});

// Set right before a guest signs in with Kakao/Google (which replaces the
// guest session); once a real session shows up, the guest's saves are
// moved over. Kept in storage because the web login redirects away, and
// kept until the move succeeds (or can never succeed), so a failed try is
// picked up again the next time the app opens. Holds the guest's refresh
// token too: the access token alone is dead after an hour.
const PENDING_CLAIM_KEY = 'cortex.pendingGuestClaim';

interface PendingClaim {
  access: string;
  refresh: string | null;
  guestId?: string;
}

async function readPending(): Promise<PendingClaim | null> {
  const raw = await AsyncStorage.getItem(PENDING_CLAIM_KEY).catch(() => null);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PendingClaim;
    if (parsed?.access) return parsed;
  } catch {}
  // Written by an older build: the bare access token.
  return { access: raw, refresh: null };
}

// A guest who logged in with an account without moving their memos: its
// session, to pick up again at the next '게스트로 시작'. Gone with the app's
// data, so a reset phone starts as someone new.
const KEPT_GUEST_KEY = 'cortex.keptGuest';

const forgetPending = () => AsyncStorage.removeItem(PENDING_CLAIM_KEY).catch(() => {});

// 400: not a guest / same account -- nothing to move, ever.
const isFinal = (err: unknown) => err instanceof ApiError && err.status === 400;
const isExpired = (err: unknown) => err instanceof ApiError && err.status === 410;

let claiming: Promise<number | null> | null = null;

// Auth events can fire several times around a login (initial session,
// token refresh); one move runs at a time.
function claimPendingGuest(userId: string): Promise<number | null> {
  claiming ??= runClaim(userId).finally(() => {
    claiming = null;
  });
  return claiming;
}

async function runClaim(userId: string): Promise<number | null> {
  let pending = await readPending();
  if (!pending) return null;
  const finished = async () => {
    if (pending?.guestId) await moveGuestTabs(pending.guestId, userId);
    await forgetPending();
  };
  try {
    try {
      const { moved } = await claimGuest(pending.access);
      await finished();
      return moved;
    } catch (err) {
      if (!isExpired(err)) throw err;
      if (!pending.refresh) {
        await forgetPending();
        return null;
      }
      const { data, error } = await refreshDetached(pending.refresh);
      if (error || !data.session) {
        // Rejected by the auth server: the guest session is gone for good.
        const status = (error as { status?: number } | null)?.status;
        if (status !== undefined && status >= 400 && status < 500) await forgetPending();
        throw error ?? new Error('guest refresh failed');
      }
      pending = { access: data.session.access_token, refresh: data.session.refresh_token, guestId: pending.guestId };
      await AsyncStorage.setItem(PENDING_CLAIM_KEY, JSON.stringify(pending)).catch(() => {});
      const { moved } = await claimGuest(pending.access);
      await finished();
      return moved;
    }
  } catch (err) {
    console.warn('guest claim failed', err);
    if (isFinal(err) || isExpired(err)) {
      await forgetPending();
    } else if (await AsyncStorage.getItem(PENDING_CLAIM_KEY).catch(() => null)) {
      showToast(S.claimLater);
    }
    return null;
  }
}

interface AuthState {
  session: Session | null;
  loading: boolean;
  signInAsGuest: () => Promise<{ error: string | null }>;
  pauseGuest: () => void;
  // Call right before signing a guest in with Kakao/Google.
  startLinking: () => Promise<void>;
  // Signed in, guest's saves still moving; the session changes after this.
  movingGuest: boolean;
  // Memos of the guest logged out on this phone, if there is one.
  pausedGuestCount: () => Promise<number>;
  // Before logging in on the login screen: the guest stays reachable.
  keepPausedGuest: () => Promise<void>;
  // The login didn't happen, so nothing is moved later by surprise.
  cancelLinking: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  session: null,
  loading: true,
  signInAsGuest: async () => ({ error: null }),
  pauseGuest: () => {},
  startLinking: async () => {},
  movingGuest: false,
  pausedGuestCount: async () => 0,
  keepPausedGuest: async () => {},
  cancelLinking: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [movingGuest, setMovingGuest] = useState(false);
  // supabase.auth.onAuthStateChange below fires (and would flip `loading`
  // back off) the instant signInAnonymously()'s network call resolves --
  // before signInAsGuest below gets a chance to seed the new account. This
  // makes that listener a no-op for exactly that one transition, so Home
  // doesn't render (and fetch, and cache "empty") a beat before the sample
  // item actually exists.
  const suppressNextAuthEvent = useRef(false);

  useEffect(() => {
    completePendingWebLogin()
      .catch((err) => console.warn('kakao login completion failed', err))
      .then(() => supabase.auth.getSession())
      .then(({ data }) => {
        setSession(data.session);
        setLoading(false);
      });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (suppressNextAuthEvent.current) return;
      // A guest just became a real account: bring the guest's saves along
      // before the app shows the account (best effort -- never holds the
      // login more than 20s; a longer move finishes in the background).
      if (newSession && !newSession.user.is_anonymous) {
        const shown = new Promise((resolve) => setTimeout(resolve, 20_000));
        setMovingGuest(true);
        void Promise.race([claimPendingGuest(newSession.user.id), shown]).finally(() => {
          setSession(newSession);
          setMovingGuest(false);
        });
        return;
      }
      setSession(newSession);
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  const signInAsGuest = async (): Promise<{ error: string | null }> => {
    setLoading(true);
    suppressNextAuthEvent.current = true;
    try {
      // "로그아웃" as a guest never actually signs out of Supabase (see
      // pauseGuest below) -- it only hides the session from this screen --
      // so the same anonymous account is usually still sitting right here,
      // still valid, ready to resume with no network call at all.
      const { data: existing } = await supabase.auth.getSession();
      if (existing.session?.user.is_anonymous) {
        setSession(existing.session);
        return { error: null };
      }

      const keptToken = await AsyncStorage.getItem(KEPT_GUEST_KEY).catch(() => null);
      if (keptToken) {
        const { data: kept, error: keptError } = await supabase.auth.refreshSession({ refresh_token: keptToken });
        if (!keptError && kept.session) {
          await AsyncStorage.removeItem(KEPT_GUEST_KEY).catch(() => {});
          setSession(kept.session);
          return { error: null };
        }
        // Offline, not gone: try again next time instead of starting over.
        const status = (keptError as { status?: number } | null)?.status;
        if (status === undefined || status < 400 || status >= 500) return { error: keptError?.message ?? 'guest refresh failed' };
        await AsyncStorage.removeItem(KEPT_GUEST_KEY).catch(() => {});
      }

      const { data, error } = await supabase.auth.signInAnonymously();
      if (error) return { error: error.message };
      // Best-effort: a seeding hiccup shouldn't strand a real, working
      // account on the login screen.
      await seedSampleItem().catch(() => {});
      setSession(data.session);
      return { error: null };
    } finally {
      suppressNextAuthEvent.current = false;
      setLoading(false);
    }
  };

  // A guest has no credential besides this one session -- actually signing
  // it out (any scope) revokes that sole session server-side for good, so
  // "로그아웃" for a guest can only mean hiding it from the UI, never ending
  // it. Real accounts keep using the real signOut() in kakaoLogin.ts.
  const pauseGuest = () => {
    setSession(null);
  };

  const startLinking = async () => {
    const { data } = await supabase.auth.getSession();
    const s = data.session;
    if (s?.user.is_anonymous) {
      const pending: PendingClaim = { access: s.access_token, refresh: s.refresh_token, guestId: s.user.id };
      await AsyncStorage.setItem(PENDING_CLAIM_KEY, JSON.stringify(pending)).catch(() => {});
    }
  };

  const pausedGuestCount = async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session?.user.is_anonymous) return 0;
    return (await fetchRecentItems(1)).total;
  };

  const keepPausedGuest = async () => {
    const { data } = await supabase.auth.getSession();
    const s = data.session;
    if (s?.user.is_anonymous && s.refresh_token) await AsyncStorage.setItem(KEPT_GUEST_KEY, s.refresh_token).catch(() => {});
  };

  return (
    <AuthContext.Provider value={{ session, loading, signInAsGuest, pauseGuest, startLinking, movingGuest, pausedGuestCount, keepPausedGuest, cancelLinking: forgetPending }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
