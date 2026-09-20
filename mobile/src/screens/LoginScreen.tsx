import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '../theme/ThemeContext';
import { MONO, emToTracking } from '../theme/themes';
import { signInWithKakao } from '../auth/kakaoLogin';
import { supabase } from '../auth/supabase';

// Kakao's own brand yellow (#FEE500) + near-black text/glyph -- their design
// guidelines ask that the login button keep this exact pair regardless of
// the app's own theme, so it stays recognizable across every app that uses
// it, the same way "Sign in with Apple" always looks the same everywhere.
const KAKAO_YELLOW = '#FEE500';
const KAKAO_TEXT = '#191919';

type Status = 'idle' | 'kakaoLoading' | 'guestLoading' | 'error';

export default function LoginScreen() {
  const { theme } = useTheme();
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');

  const onPress = async () => {
    setStatus('kakaoLoading');
    setError('');
    try {
      await signInWithKakao();
      // Web: the page redirects away here and never reaches this line.
      // Native: a resolved promise means the session is already set, and
      // AuthContext's onAuthStateChange listener flips the app over.
      setStatus('idle');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  };

  // Anonymous Supabase auth -- a real, isolated account (own user_id, own
  // data, nothing shared with other guests the way the old DEV_USER_ID
  // fallback was), just one with no recoverable credential. Signing out (or
  // uninstalling) loses access to it for good, which is the honest version
  // of "guest data doesn't follow you" -- it's not that nothing gets saved.
  const onGuestPress = async () => {
    setStatus('guestLoading');
    setError('');
    const { error: signInError } = await supabase.auth.signInAnonymously();
    if (signInError) {
      setError(signInError.message);
      setStatus('error');
      return;
    }
    setStatus('idle');
  };

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: theme.bg }]}>
      <View style={styles.body}>
        <Text style={{ fontFamily: MONO, fontSize: 13, letterSpacing: emToTracking(0.26, 13), color: theme.accent }}>
          CORTEX
        </Text>
        <Text
          style={[
            styles.title,
            { color: theme.ink, fontFamily: theme.headFamily, fontWeight: theme.headWeight, marginTop: 14 },
          ]}
        >
          공유하면{'\n'}저장되는 기억
        </Text>
        <Text style={[styles.subtitle, { color: theme.sub }]}>
          카카오 계정으로 로그인하면{'\n'}내 기억만 안전하게 모아둘 수 있어요.
        </Text>
      </View>

      <View style={styles.footer}>
        {status === 'error' && (
          <Text style={[styles.errorText, { color: theme.accent }]}>로그인 실패: {error}</Text>
        )}
        <Pressable
          onPress={onPress}
          disabled={status !== 'idle' && status !== 'error'}
          style={[styles.kakaoButton, { opacity: status === 'kakaoLoading' ? 0.7 : 1 }]}
        >
          {status === 'kakaoLoading' ? (
            <ActivityIndicator color={KAKAO_TEXT} />
          ) : (
            <Text style={styles.kakaoButtonText}>카카오로 로그인</Text>
          )}
        </Pressable>
        <Pressable
          onPress={onGuestPress}
          disabled={status !== 'idle' && status !== 'error'}
          style={[styles.guestButton, { borderColor: theme.line, opacity: status === 'guestLoading' ? 0.7 : 1 }]}
        >
          {status === 'guestLoading' ? (
            <ActivityIndicator color={theme.ink} />
          ) : (
            <Text style={[styles.guestButtonText, { color: theme.ink }]}>게스트로 시작</Text>
          )}
        </Pressable>
        <Text style={[styles.guestNote, { color: theme.sub }]}>
          게스트는 이 기기에서 로그아웃하면 다시 못 봐요.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 28 },
  body: { flex: 1, justifyContent: 'center' },
  title: { fontSize: 32, lineHeight: 40, letterSpacing: -0.5 },
  subtitle: { fontSize: 14.5, lineHeight: 22, marginTop: 16, fontFamily: 'IBMPlexSansKR_400Regular' },
  footer: { paddingBottom: 32, gap: 12 },
  errorText: { fontSize: 13, textAlign: 'center', fontFamily: 'IBMPlexSansKR_400Regular' },
  kakaoButton: {
    backgroundColor: KAKAO_YELLOW,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kakaoButtonText: { color: KAKAO_TEXT, fontSize: 16, fontFamily: 'IBMPlexSansKR_500Medium' },
  guestButton: {
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guestButtonText: { fontSize: 15, fontFamily: 'IBMPlexSansKR_500Medium' },
  guestNote: { fontSize: 12.5, textAlign: 'center', fontFamily: 'IBMPlexSansKR_400Regular' },
});
