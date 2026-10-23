import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useTheme } from '../theme/ThemeContext';
import { MONO, emToTracking } from '../theme/themes';
import { frameStyle } from '../components/Card';
import { ButtonRow, GhostButton, SolidButton } from '../components/Buttons';
import { COMMON } from '../i18n/common';
import { signInWithKakao } from '../auth/kakaoLogin';
import { GoogleSignInCancelled, signInWithGoogle } from '../auth/googleLogin';
import { GoogleIcon } from '../components/Icons';
import { useAuth } from '../auth/AuthContext';
import { friendlyError, seedSampleItem } from '../api/client';
import { LANG, PRIVACY_URL, TERMS_URL, strings } from '../i18n';

const S = strings({
  ko: {
    title1: '공유하면',
    title2: '저장되는 기억',
    sub1: '로그인하면 Pro 7일 무료 체험이 있어요.',
    sub2: '내 기억은 계정에 안전하게 모여요.',
    failed: (e: string) => `로그인 실패: ${e}`,
    kakao: '카카오로 로그인',
    guest: '게스트로 시작',
    guestNote: '게스트는 체험 없이 무료로 시작해요. 기록은 이 기기에서만 볼 수 있고, 나중에 계정으로 옮길 수 없어요.',
    google: 'Google로 계속하기',
    lastUsed: '최근 로그인',
    guestTitle: '게스트로 시작할까요?',
    guestStart: '시작',
    guestLines: ['체험 없이 무료로 시작해요 (로그인하면 7일 체험)', '기록은 이 기기에만 남아요', '나중에 설정에서 계정을 연결하면 기록을 옮길 수 있어요'],
    policyPre: '계속하면 ',
    terms: '이용약관',
    policyAnd: ' 및 ',
    privacy: '개인정보처리방침',
    policyPost: '에 동의하는 것으로 간주돼요.',
  },
  en: {
    title1: 'Share it,',
    title2: 'and it’s saved',
    sub1: 'Sign in for a 7-day free Pro trial.',
    sub2: 'Your memories stay safe in your account.',
    failed: (e: string) => `Login failed: ${e}`,
    kakao: 'Continue with Kakao',
    guest: 'Start as guest',
    guestNote: "Guests start free, with no trial. Your saves stay on this device only and can't be moved to an account later.",
    google: 'Continue with Google',
    lastUsed: 'Last used',
    guestTitle: 'Start as a guest?',
    guestStart: 'Start',
    guestLines: ['Free, without the trial (sign in for 7 days of Pro)', 'Your saves stay on this device', 'Link an account later in settings to keep them'],
    policyPre: 'By continuing, you agree to the ',
    terms: 'Terms',
    policyAnd: ' and ',
    privacy: 'Privacy Policy',
    policyPost: '.',
  },
  ja: {
    title1: '共有するだけで',
    title2: '残る記憶',
    sub1: 'ログインするとPro 7日間無料体験があります。',
    sub2: '記憶はアカウントに安全にまとまります。',
    failed: (e: string) => `ログイン失敗: ${e}`,
    kakao: 'Kakaoでログイン',
    guest: 'ゲストで始める',
    guestNote: 'ゲストは体験なしの無料で始まります。記録はこの端末でのみ見られ、後からアカウントへ移せません。',
    google: 'Googleで続ける',
    lastUsed: '前回のログイン',
    guestTitle: 'ゲストで始めますか?',
    guestStart: '始める',
    guestLines: ['体験なしの無料で始まります(ログインで7日間体験)', '記録はこの端末にだけ残ります', 'あとで設定からアカウントを連携すれば記録を移せます'],
    policyPre: '続けると',
    terms: '利用規約',
    policyAnd: 'と',
    privacy: 'プライバシーポリシー',
    policyPost: 'に同意したものとみなされます。',
  },
  'zh-Hans': {
    title1: '一分享',
    title2: '就存下的记忆',
    sub1: '登录即可免费试用 Pro 7 天。',
    sub2: '你的记忆会安全地存在账号里。',
    failed: (e: string) => `登录失败：${e}`,
    kakao: '使用 Kakao 登录',
    guest: '以访客身份开始',
    guestNote: '访客免费开始，没有试用。记录只能在这台设备上查看，之后也无法转移到账号。',
    google: '使用 Google 继续',
    lastUsed: '上次登录',
    guestTitle: '以访客身份开始？',
    guestStart: '开始',
    guestLines: ['免费开始，没有试用（登录可试用 7 天）', '记录只保存在这台设备上', '之后在设置中关联账号即可转移记录'],
    policyPre: '继续即表示你同意',
    terms: '使用条款',
    policyAnd: '和',
    privacy: '隐私政策',
    policyPost: '。',
  },
  'zh-Hant': {
    title1: '一分享',
    title2: '就存下的記憶',
    sub1: '登入即可免費試用 Pro 7 天。',
    sub2: '你的記憶會安全地存在帳號裡。',
    failed: (e: string) => `登入失敗：${e}`,
    kakao: '使用 Kakao 登入',
    guest: '以訪客身分開始',
    guestNote: '訪客免費開始，沒有試用。紀錄只能在這台裝置上查看，之後也無法轉移到帳號。',
    google: '使用 Google 繼續',
    lastUsed: '上次登入',
    guestTitle: '以訪客身分開始？',
    guestStart: '開始',
    guestLines: ['免費開始，沒有試用（登入可試用 7 天）', '紀錄只保存在這台裝置上', '之後在設定中連結帳號即可轉移紀錄'],
    policyPre: '繼續即表示你同意',
    terms: '使用條款',
    policyAnd: '和',
    privacy: '隱私權政策',
    policyPost: '。',
  },
});

// Kakao's own brand yellow (#FEE500) + near-black text/glyph -- their design
// guidelines ask that the login button keep this exact pair regardless of
// the app's own theme, so it stays recognizable across every app that uses
// it, the same way "Sign in with Apple" always looks the same everywhere.
const KAKAO_YELLOW = '#FEE500';
const KAKAO_TEXT = '#191919';
// Google's sign-in button guidelines: white, a light gray outline, dark
// gray text and the four-color G -- same in every theme, like Kakao's.
const GOOGLE_TEXT = '#1F1F1F';
const GOOGLE_OUTLINE = '#747775';

type Status = 'idle' | 'kakaoLoading' | 'googleLoading' | 'guestLoading' | 'error';

// Which way this phone signed in last time -- shown as a small "최근 로그인"
// bubble on that button, since people forget whether they used Kakao or
// Google. Kept on the device only.
type Method = 'kakao' | 'google' | 'guest';
const LAST_LOGIN_KEY = 'cortex.lastLogin';
function rememberLogin(method: Method) {
  AsyncStorage.setItem(LAST_LOGIN_KEY, method).catch(() => {});
}

export default function LoginScreen() {
  const { theme } = useTheme();
  const { signInAsGuest } = useAuth();
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');
  const [lastMethod, setLastMethod] = useState<Method | null>(null);
  const [confirmGuest, setConfirmGuest] = useState(false);
  useEffect(() => {
    AsyncStorage.getItem(LAST_LOGIN_KEY)
      .then((v) => setLastMethod(v === 'kakao' || v === 'google' || v === 'guest' ? v : null))
      .catch(() => {});
  }, []);

  const onPress = async () => {
    setStatus('kakaoLoading');
    setError('');
    try {
      if (Platform.OS === 'web') rememberLogin('kakao');
      await signInWithKakao();
      rememberLogin('kakao');
      // Web: the page redirects away here and never reaches this line.
      // Native: a resolved promise means the session is already set, and
      // AuthContext's onAuthStateChange listener flips the app over.
      setStatus('idle');
    } catch (err) {
      setError(friendlyError(err));
      setStatus('error');
    }
  };

  const onGooglePress = async () => {
    setStatus('googleLoading');
    setError('');
    try {
      if (Platform.OS === 'web') rememberLogin('google');
      await signInWithGoogle();
      rememberLogin('google');
      // A first Google login gets the same sample item a Kakao signup does
      // (the server only seeds an empty account, so a returning one is safe).
      await seedSampleItem().catch(() => {});
      setStatus('idle');
    } catch (err) {
      if (err instanceof GoogleSignInCancelled) {
        setStatus('idle');
        return;
      }
      setError(friendlyError(err));
      setStatus('error');
    }
  };

  // Anonymous Supabase auth -- a real, isolated account (own user_id, own
  // data, nothing shared with other guests the way the old DEV_USER_ID
  // fallback was), just one with no recoverable credential. Signing out (or
  // uninstalling) loses access to it for good, which is the honest version
  // of "guest data doesn't follow you" -- it's not that nothing gets saved.
  // signInAsGuest (AuthContext) holds the app on a loading spinner until the
  // sample item is actually seeded, so Home's first render doesn't fetch and
  // cache an empty list a beat before it exists.
  const onGuestPress = async () => {
    setStatus('guestLoading');
    setError('');
    const { error: signInError } = await signInAsGuest();
    if (signInError) {
      setError(signInError);
      setStatus('error');
      return;
    }
    rememberLogin('guest');
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
          {S.title1}{'\n'}{S.title2}
        </Text>
        <Text style={[styles.subtitle, { color: theme.sub }]}>
          {S.sub1}{'\n'}{S.sub2}
        </Text>
      </View>

      <View style={styles.footer}>
        {status === 'error' && (
          <Text style={[styles.errorText, { color: theme.danger }]}>{S.failed(error)}</Text>
        )}
        {LANG === 'ko' ? (
          <>
        <View style={styles.buttonWrap}>
          <Pressable
            onPress={onPress}
            disabled={status !== 'idle' && status !== 'error'}
            style={[styles.kakaoButton, { borderRadius: theme.btnRadius, opacity: status === 'kakaoLoading' ? 0.7 : 1 }]}
          >
            {status === 'kakaoLoading' ? (
              <ActivityIndicator color={KAKAO_TEXT} />
            ) : (
              <Text style={styles.kakaoButtonText}>{S.kakao}</Text>
            )}
          </Pressable>
          {lastMethod === 'kakao' && <LastUsed theme={theme} label={S.lastUsed} />}
        </View>
        <View style={styles.buttonWrap}>
          <Pressable
            onPress={onGooglePress}
            disabled={status !== 'idle' && status !== 'error'}
            style={[styles.googleButton, { borderRadius: theme.btnRadius, opacity: status === 'googleLoading' ? 0.7 : 1 }]}
          >
            {status === 'googleLoading' ? (
              <ActivityIndicator color={GOOGLE_TEXT} />
            ) : (
              <View style={styles.googleInner}>
                <GoogleIcon size={18} />
                <Text style={styles.googleButtonText}>{S.google}</Text>
              </View>
            )}
          </Pressable>
          {lastMethod === 'google' && <LastUsed theme={theme} label={S.lastUsed} />}
        </View>
          </>
        ) : (
          <>
        <View style={styles.buttonWrap}>
          <Pressable
            onPress={onGooglePress}
            disabled={status !== 'idle' && status !== 'error'}
            style={[styles.googleButton, { borderRadius: theme.btnRadius, opacity: status === 'googleLoading' ? 0.7 : 1 }]}
          >
            {status === 'googleLoading' ? (
              <ActivityIndicator color={GOOGLE_TEXT} />
            ) : (
              <View style={styles.googleInner}>
                <GoogleIcon size={18} />
                <Text style={styles.googleButtonText}>{S.google}</Text>
              </View>
            )}
          </Pressable>
          {lastMethod === 'google' && <LastUsed theme={theme} label={S.lastUsed} />}
        </View>
        <View style={styles.buttonWrap}>
          <Pressable
            onPress={onPress}
            disabled={status !== 'idle' && status !== 'error'}
            style={[styles.kakaoButton, { borderRadius: theme.btnRadius, opacity: status === 'kakaoLoading' ? 0.7 : 1 }]}
          >
            {status === 'kakaoLoading' ? (
              <ActivityIndicator color={KAKAO_TEXT} />
            ) : (
              <Text style={styles.kakaoButtonText}>{S.kakao}</Text>
            )}
          </Pressable>
          {lastMethod === 'kakao' && <LastUsed theme={theme} label={S.lastUsed} />}
        </View>
          </>
        )}
        <View style={styles.buttonWrap}>
          <Pressable
            onPress={() => setConfirmGuest(true)}
            disabled={status !== 'idle' && status !== 'error'}
            style={[styles.guestButton, frameStyle(theme), { borderRadius: theme.btnRadius, opacity: status === 'guestLoading' ? 0.7 : 1 }]}
          >
            {status === 'guestLoading' ? (
              <ActivityIndicator color={theme.ink} />
            ) : (
              <Text style={[styles.guestButtonText, { color: theme.ink }]}>{S.guest}</Text>
            )}
          </Pressable>
          {lastMethod === 'guest' && <LastUsed theme={theme} label={S.lastUsed} />}
        </View>
        {confirmGuest && (
          <View style={[styles.guestConfirm, frameStyle(theme), { borderRadius: theme.cardRadius }]}>
            <Text style={[styles.guestConfirmTitle, { color: theme.ink }]}>{S.guestTitle}</Text>
            {S.guestLines.map((line) => (
              <Text key={line} style={[styles.guestNote, { color: theme.sub }]}>
                {line}
              </Text>
            ))}
            <ButtonRow theme={theme} style={{ marginTop: 6 }}>
              <GhostButton label={COMMON.cancel} theme={theme} size="sm" onPress={() => setConfirmGuest(false)} disabled={status === 'guestLoading'} />
              <SolidButton
                label={S.guestStart}
                theme={theme}
                size="sm"
                loading={status === 'guestLoading'}
                onPress={() => {
                  void onGuestPress();
                }}
              />
            </ButtonRow>
          </View>
        )}
        <Text style={[styles.policyNote, { color: theme.sub }]}>
          {S.policyPre}
          <Text
            style={styles.policyLink}
            onPress={() => Linking.openURL(TERMS_URL)}
          >
            {S.terms}
          </Text>
          {S.policyAnd}
          <Text
            style={styles.policyLink}
            onPress={() => Linking.openURL(PRIVACY_URL)}
          >
            {S.privacy}
          </Text>
          {S.policyPost}
        </Text>
      </View>
    </SafeAreaView>
  );
}

// The small bubble sitting on the button's top edge.
function LastUsed({ theme, label }: { theme: ReturnType<typeof useTheme>['theme']; label: string }) {
  return (
    <View pointerEvents="none" style={[styles.lastUsed, { backgroundColor: theme.ink, borderRadius: theme.pickRadius }]}>
      <Text style={[styles.lastUsedText, { color: theme.bg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  guestConfirm: { padding: 14, gap: 4 },
  guestConfirmTitle: { fontSize: 14.5, marginBottom: 2, fontFamily: 'IBMPlexSansKR_500Medium' },
  buttonWrap: { position: 'relative' },
  lastUsed: { position: 'absolute', top: -9, right: 14, paddingHorizontal: 8, paddingVertical: 2 },
  lastUsedText: { fontSize: 11, fontFamily: 'IBMPlexSansKR_500Medium' },
  screen: { flex: 1, paddingHorizontal: 28 },
  body: { flex: 1, justifyContent: 'center' },
  title: { fontSize: 32, lineHeight: 40, letterSpacing: -0.5 },
  subtitle: { fontSize: 14.5, lineHeight: 22, marginTop: 16, fontFamily: 'IBMPlexSansKR_400Regular' },
  footer: { paddingBottom: 32, gap: 12 },
  errorText: { fontSize: 13, textAlign: 'center', fontFamily: 'IBMPlexSansKR_400Regular' },
  kakaoButton: {
    backgroundColor: KAKAO_YELLOW,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kakaoButtonText: { color: KAKAO_TEXT, fontSize: 16, fontFamily: 'IBMPlexSansKR_500Medium' },
  googleButton: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: GOOGLE_OUTLINE,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleInner: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  googleButtonText: { color: GOOGLE_TEXT, fontSize: 16, fontFamily: 'IBMPlexSansKR_500Medium' },
  guestButton: {
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guestButtonText: { fontSize: 15, fontFamily: 'IBMPlexSansKR_500Medium' },
  guestNote: { fontSize: 12.5, textAlign: 'center', fontFamily: 'IBMPlexSansKR_400Regular' },
  policyNote: { fontSize: 11.5, textAlign: 'center', marginTop: 4, lineHeight: 17, fontFamily: 'IBMPlexSansKR_400Regular' },
  policyLink: { textDecorationLine: 'underline' },
});
