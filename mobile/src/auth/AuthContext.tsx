import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { completePendingWebLogin } from './kakaoLogin';
import { seedSampleItem } from '../api/client';

interface AuthState {
  session: Session | null;
  loading: boolean;
  signInAsGuest: () => Promise<{ error: string | null }>;
  pauseGuest: () => void;
}

const AuthContext = createContext<AuthState>({
  session: null,
  loading: true,
  signInAsGuest: async () => ({ error: null }),
  pauseGuest: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
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

  return (
    <AuthContext.Provider value={{ session, loading, signInAsGuest, pauseGuest }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
