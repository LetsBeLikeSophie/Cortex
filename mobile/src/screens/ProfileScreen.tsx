import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useTheme } from '../theme/ThemeContext';
import { LAYOUTS, PALETTES, allEdges, conceptOf } from '../theme/themes';
import { useAuth } from '../auth/AuthContext';
import { signInWithKakao, signOut } from '../auth/kakaoLogin';
import { GoogleSignInCancelled, signInWithGoogle } from '../auth/googleLogin';
import { deleteAccount, fetchPlan, Plan, friendlyError } from '../api/client';
import { ProfileIcon } from '../components/Icons';
import { ScreenHeader } from '../components/ScreenHeader';
import { frameStyle, screenGutter } from '../components/Card';
import { ConfirmCard } from '../components/ConfirmCard';
import { GhostButton } from '../components/Buttons';
import { PLAY_SUBSCRIPTIONS_URL, isLifetimePro } from '../billing/types';
import type { RootStackParamList } from '../navigation/types';
import { LANG_PREF, LANGUAGE_NAMES, LangPref, PRIVACY_URL, TERMS_URL, setLanguage, strings } from '../i18n';

const S = strings({
  ko: {
    trial: (days: number) => `무료 체험 · ${days}일 남음`,
    free: (used: number, limit: number) => `무료 · AI 정리 ${used}/${limit}`,
    guest: '게스트',
    noName: '이름 없음',
    title: '내 계정',
    asGuest: '게스트로 이용 중',
    asKakao: '카카오 계정으로 로그인됨',
    asGoogle: 'Google 계정으로 로그인됨',
    linkTitle: '계정 연결',
    linkNote: '연결하면 지금 기록을 그 계정으로 옮겨요',
    linkKakao: '카카오로 연결',
    linkGoogle: 'Google로 연결',
    confirmGuest: '정말 삭제하시겠어요?',
    confirmAccount: '정말 탈퇴하시겠어요?',
    bodyGuest: '이 게스트가 저장한 기억이 모두 사라지고, 되돌릴 수 없어요.',
    bodyAccount: '저장된 기억이 모두 사라지고, 되돌릴 수 없어요.',
    deleteGuest: '삭제하기',
    deleteAccount: '탈퇴하기',
    deleteFailed: (e: string) => `삭제 실패: ${e}`,
    subWarning: '탈퇴해도 Play 구독은 해지되지 않아요. 먼저 해지해 주세요.',
    manageSub: '구독 관리 열기',
    plan: '플랜',
    aiConsent: 'AI 분석 동의',
    langNote: '메뉴와 AI 메모가 이 언어로 나와요',
    langDevice: '휴대폰 설정 따르기',
    language: '언어',
    agreed: '동의함',
    declined: '동의 안 함',
    notYet: '아직 안 함',
    theme: '테마',
    signOut: '로그아웃',
    deleteGuestData: '게스트 데이터 삭제',
    leave: '회원 탈퇴',
    terms: '이용약관',
    privacy: '개인정보처리방침',
  },
  en: {
    trial: (days: number) => `Free trial · ${days} days left`,
    free: (used: number, limit: number) => `Free · AI sorting ${used}/${limit}`,
    guest: 'Guest',
    noName: 'No name',
    title: 'My account',
    asGuest: 'Using as a guest',
    asKakao: 'Signed in with Kakao',
    asGoogle: 'Signed in with Google',
    linkTitle: 'Link an account',
    linkNote: 'Your saves move to that account',
    linkKakao: 'Link Kakao',
    linkGoogle: 'Link Google',
    confirmGuest: 'Delete everything?',
    confirmAccount: 'Delete your account?',
    bodyGuest: "Everything this guest saved will be gone, and this can't be undone.",
    bodyAccount: "Everything you saved will be gone, and this can't be undone.",
    deleteGuest: 'Delete',
    deleteAccount: 'Delete account',
    deleteFailed: (e: string) => `Couldn't delete: ${e}`,
    subWarning: "Deleting your account doesn't cancel your Play subscription. Cancel it first.",
    manageSub: 'Manage subscription',
    plan: 'Plan',
    aiConsent: 'AI analysis consent',
    langNote: 'Menus and AI memos use this language',
    langDevice: 'Same as phone',
    language: 'Language',
    agreed: 'Agreed',
    declined: 'Declined',
    notYet: 'Not yet',
    theme: 'Theme',
    signOut: 'Log out',
    deleteGuestData: 'Delete guest data',
    leave: 'Delete account',
    terms: 'Terms',
    privacy: 'Privacy Policy',
  },
  ja: {
    trial: (days: number) => `無料体験 · 残り${days}日`,
    free: (used: number, limit: number) => `無料 · AI整理 ${used}/${limit}`,
    guest: 'ゲスト',
    noName: '名前なし',
    title: 'マイアカウント',
    asGuest: 'ゲストで利用中',
    asKakao: 'Kakaoアカウントでログイン中',
    asGoogle: 'Googleアカウントでログイン中',
    linkTitle: 'アカウント連携',
    linkNote: '今の記録がそのアカウントに移ります',
    linkKakao: 'Kakaoで連携',
    linkGoogle: 'Googleで連携',
    confirmGuest: '本当に削除しますか？',
    confirmAccount: '本当に退会しますか？',
    bodyGuest: 'このゲストが保存した記憶はすべて消え、元に戻せません。',
    bodyAccount: '保存した記憶はすべて消え、元に戻せません。',
    deleteGuest: '削除する',
    deleteAccount: '退会する',
    deleteFailed: (e: string) => `削除失敗: ${e}`,
    subWarning: '退会してもPlayのサブスクは解約されません。先に解約してください。',
    manageSub: 'サブスク管理を開く',
    plan: 'プラン',
    aiConsent: 'AI分析への同意',
    langNote: 'メニューとAIメモがこの言語になります',
    langDevice: '端末の設定に合わせる',
    language: '言語',
    agreed: '同意済み',
    declined: '同意しない',
    notYet: '未回答',
    theme: 'テーマ',
    signOut: 'ログアウト',
    deleteGuestData: 'ゲストデータを削除',
    leave: '退会',
    terms: '利用規約',
    privacy: 'プライバシーポリシー',
  },
  'zh-Hans': {
    trial: (days: number) => `免费试用 · 剩 ${days} 天`,
    free: (used: number, limit: number) => `免费 · AI 整理 ${used}/${limit}`,
    guest: '访客',
    noName: '未命名',
    title: '我的账号',
    asGuest: '以访客身份使用中',
    asKakao: '已使用 Kakao 账号登录',
    asGoogle: '已使用 Google 账号登录',
    linkTitle: '关联账号',
    linkNote: '现在的记录会转到该账号',
    linkKakao: '关联 Kakao',
    linkGoogle: '关联 Google',
    confirmGuest: '确定要删除吗？',
    confirmAccount: '确定要注销账号吗？',
    bodyGuest: '这个访客保存的记忆将全部消失，且无法恢复。',
    bodyAccount: '保存的记忆将全部消失，且无法恢复。',
    deleteGuest: '删除',
    deleteAccount: '注销',
    deleteFailed: (e: string) => `删除失败：${e}`,
    subWarning: '注销账号不会取消 Play 订阅。请先取消订阅。',
    manageSub: '打开订阅管理',
    plan: '套餐',
    aiConsent: 'AI 分析授权',
    langNote: '菜单和 AI 笔记都会使用这个语言',
    langDevice: '跟随手机设置',
    language: '语言',
    agreed: '已同意',
    declined: '不同意',
    notYet: '尚未选择',
    theme: '主题',
    signOut: '退出登录',
    deleteGuestData: '删除访客数据',
    leave: '注销账号',
    terms: '使用条款',
    privacy: '隐私政策',
  },
  'zh-Hant': {
    trial: (days: number) => `免費試用 · 剩 ${days} 天`,
    free: (used: number, limit: number) => `免費 · AI 整理 ${used}/${limit}`,
    guest: '訪客',
    noName: '未命名',
    title: '我的帳號',
    asGuest: '以訪客身分使用中',
    asKakao: '已使用 Kakao 帳號登入',
    asGoogle: '已使用 Google 帳號登入',
    linkTitle: '連結帳號',
    linkNote: '現在的紀錄會轉到該帳號',
    linkKakao: '連結 Kakao',
    linkGoogle: '連結 Google',
    confirmGuest: '確定要刪除嗎？',
    confirmAccount: '確定要刪除帳號嗎？',
    bodyGuest: '這個訪客儲存的記憶將全部消失，且無法復原。',
    bodyAccount: '儲存的記憶將全部消失，且無法復原。',
    deleteGuest: '刪除',
    deleteAccount: '刪除帳號',
    deleteFailed: (e: string) => `刪除失敗：${e}`,
    subWarning: '刪除帳號不會取消 Play 訂閱。請先取消訂閱。',
    manageSub: '開啟訂閱管理',
    plan: '方案',
    aiConsent: 'AI 分析授權',
    langNote: '選單和 AI 筆記都會使用這個語言',
    langDevice: '跟隨手機設定',
    language: '語言',
    agreed: '已同意',
    declined: '不同意',
    notYet: '尚未選擇',
    theme: '主題',
    signOut: '登出',
    deleteGuestData: '刪除訪客資料',
    leave: '刪除帳號',
    terms: '使用條款',
    privacy: '隱私權政策',
  },
});

type FooterState = 'idle' | 'signingOut' | 'confirmingDelete' | 'deleting' | 'deleteError';

export default function ProfileScreen() {
  const { theme, layoutKey, paletteKey } = useTheme();
  const { session, pauseGuest, startLinking } = useAuth();
  const [linking, setLinking] = useState<'kakao' | 'google' | null>(null);
  const [langOpen, setLangOpen] = useState(false);
  const [linkError, setLinkError] = useState('');
  // A guest signs in with a real account; AuthContext moves the saves over.
  const link = async (method: 'kakao' | 'google') => {
    setLinkError('');
    setLinking(method);
    try {
      await startLinking();
      if (method === 'kakao') await signInWithKakao();
      else await signInWithGoogle();
    } catch (err) {
      if (!(err instanceof GoogleSignInCancelled)) setLinkError(friendlyError(err));
    } finally {
      setLinking(null);
    }
  };
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [state, setState] = useState<FooterState>('idle');
  const [error, setError] = useState('');
  const [plan, setPlan] = useState<Plan | null>(null);
  useFocusEffect(
    useCallback(() => {
      fetchPlan()
        .then(setPlan)
        .catch(() => {});
    }, [])
  );
  const planLabel =
    plan?.tier === 'pro'
      ? 'Pro'
      : plan?.tier === 'trial'
        ? S.trial(Math.max(0, Math.ceil((new Date(plan.trialEndsAt).getTime() - Date.now()) / 86400000)))
        : plan
          ? S.free(plan.classify.used, plan.classify.limit)
          : '';

  const renewingPro = plan?.tier === 'pro' && !isLifetimePro(plan.proUntil);
  const isGuest = session?.user.is_anonymous ?? false;
  const meta = session?.user.user_metadata as { nickname?: string; full_name?: string; name?: string; avatar_url?: string; picture?: string } | undefined;
  // Google accounts carry their name as full_name/name and picture as
  // avatar_url/picture; Kakao ones as nickname/avatar_url.
  const isGoogle = session?.user.app_metadata?.provider === 'google';
  const nickname = isGuest ? S.guest : meta?.nickname ?? meta?.full_name ?? meta?.name ?? S.noName;
  const avatarUrl = isGuest ? undefined : meta?.avatar_url ?? meta?.picture;

  const onSignOut = async () => {
    setState('signingOut');
    if (isGuest) {
      // A guest has no credential besides this one session -- actually
      // signing it out would revoke it for good, so logging out here only
      // hides it; the same account (and data) is still there to resume
      // next time "게스트로 체험하기" is tapped.
      pauseGuest();
      return;
    }
    await signOut();
    // No need to reset state/navigate on success -- AuthContext's session
    // flips to null and App.tsx swaps this whole stack for LoginScreen.
    // supabase-js's signOut clears local state even if the network call
    // fails, so this path is effectively always hit.
  };

  const onConfirmDelete = async () => {
    setState('deleting');
    try {
      await deleteAccount();
      await signOut(); // the account is actually gone now -- clear the local session -> LoginScreen
    } catch (err) {
      setError(friendlyError(err));
      setState('deleteError');
    }
  };

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: theme.bg }]} edges={['top']}>
      <ScreenHeader title={S.title} theme={theme} onBack={() => navigation.goBack()} />

      <View style={[styles.body, { paddingHorizontal: screenGutter(theme) }]}>
        <View style={styles.identity}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={[styles.avatar, { backgroundColor: theme.soft }]} />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: theme.soft }]}>
              <ProfileIcon size={26} color={theme.sub} strokeWidth={1.2} />
            </View>
          )}
          <Text style={[styles.nickname, { color: theme.ink, fontFamily: theme.headFamily, fontWeight: theme.headWeight }]}>
            {nickname}
          </Text>
          <Text style={[styles.provider, { color: theme.sub }]}>
            {isGuest ? S.asGuest : isGoogle ? S.asGoogle : S.asKakao}
          </Text>
        </View>

        {state === 'confirmingDelete' || state === 'deleting' || state === 'deleteError' ? (
          <ConfirmCard
            theme={theme}
            title={isGuest ? S.confirmGuest : S.confirmAccount}
            body={isGuest ? S.bodyGuest : S.bodyAccount}
            confirmLabel={isGuest ? S.deleteGuest : S.deleteAccount}
            busy={state === 'deleting'}
            error={state === 'deleteError' ? S.deleteFailed(error) : undefined}
            onCancel={() => setState('idle')}
            onConfirm={onConfirmDelete}
          >
            {/* Deleting the account doesn't touch the Play subscription --
                it would keep billing. Say so before, with the way there. */}
            {renewingPro && (
              <>
                <Text style={[styles.subWarning, { color: theme.danger }]}>
                  {S.subWarning}
                </Text>
                <Pressable onPress={() => Linking.openURL(PLAY_SUBSCRIPTIONS_URL).catch(() => {})} hitSlop={6}>
                  <Text style={[styles.subLink, { color: theme.ink }]}>{S.manageSub}</Text>
                </Pressable>
              </>
            )}
          </ConfirmCard>
        ) : (
          // Theme sits in its own group, well clear of sign-out/delete --
          // matching borders on adjacent buttons with only a small gap
          // read as one connected control and invited mis-taps.
          <View style={{ gap: 28 }}>
            {isGuest && (
              <View style={[styles.linkBox, frameStyle(theme), { borderRadius: theme.cardRadius }]}>
                <Text style={[styles.signOutLabel, { color: theme.ink }]}>{S.linkTitle}</Text>
                <Text style={{ fontSize: 13, color: theme.sub, fontFamily: 'IBMPlexSansKR_400Regular' }}>{S.linkNote}</Text>
                <View style={styles.linkButtons}>
                  <GhostButton label={S.linkKakao} theme={theme} size="sm" onPress={() => link('kakao')} disabled={linking !== null} />
                  <GhostButton label={S.linkGoogle} theme={theme} size="sm" onPress={() => link('google')} disabled={linking !== null} />
                </View>
                {linking !== null && <ActivityIndicator color={theme.ink} />}
                {linkError !== '' && <Text style={{ fontSize: 12.5, color: theme.danger, fontFamily: 'IBMPlexSansKR_400Regular' }}>{linkError}</Text>}
              </View>
            )}
            <Pressable
              onPress={() => navigation.navigate('Paywall')}
              style={[styles.signOutButton, styles.themeRow, frameStyle(theme), { borderRadius: theme.cardRadius }]}
            >
              <Text style={[styles.signOutLabel, { color: theme.ink }]}>{S.plan}</Text>
              <Text style={{ fontSize: 14, color: theme.sub, fontFamily: 'IBMPlexSansKR_400Regular' }}>{planLabel}</Text>
            </Pressable>
            <View>
              <Pressable
                onPress={() => setLangOpen((o) => !o)}
                style={[styles.signOutButton, styles.themeRow, frameStyle(theme), { borderRadius: theme.cardRadius }]}
              >
                <Text style={[styles.signOutLabel, { color: theme.ink }]}>{S.language}</Text>
                <Text style={{ fontSize: 14, color: theme.sub, fontFamily: 'IBMPlexSansKR_400Regular' }}>
                  {LANG_PREF === 'device' ? S.langDevice : LANGUAGE_NAMES[LANG_PREF]}
                </Text>
              </Pressable>
              {langOpen && (
                <View style={styles.langList}>
                  {(['device', 'ko', 'en', 'ja', 'zh-Hans', 'zh-Hant'] as LangPref[]).map((pref) => {
                    const active = LANG_PREF === pref;
                    return (
                      <Pressable
                        key={pref}
                        onPress={() => {
                          setLangOpen(false);
                          if (!active) setLanguage(pref);
                        }}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: active }}
                        style={styles.langRow}
                        hitSlop={4}
                      >
                        <Text style={{ fontSize: 14.5, color: active ? theme.ink : theme.sub, fontFamily: active ? 'IBMPlexSansKR_500Medium' : 'IBMPlexSansKR_400Regular' }}>
                          {pref === 'device' ? S.langDevice : LANGUAGE_NAMES[pref]}
                          {active ? '  ✓' : ''}
                        </Text>
                      </Pressable>
                    );
                  })}
                  <Text style={{ fontSize: 12.5, color: theme.sub, marginTop: 4, fontFamily: 'IBMPlexSansKR_400Regular' }}>{S.langNote}</Text>
                </View>
              )}
            </View>
            <Pressable
              onPress={() => navigation.navigate('AiConsent')}
              style={[styles.signOutButton, styles.themeRow, frameStyle(theme), { borderRadius: theme.cardRadius }]}
            >
              <Text style={[styles.signOutLabel, { color: theme.ink }]}>{S.aiConsent}</Text>
              <Text style={{ fontSize: 14, color: theme.sub, fontFamily: 'IBMPlexSansKR_400Regular' }}>
                {plan?.aiConsent === 'agreed' ? S.agreed : plan?.aiConsent === 'declined' ? S.declined : S.notYet}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => navigation.navigate('ThemePicker')}
              style={[styles.signOutButton, styles.themeRow, frameStyle(theme), { borderRadius: theme.cardRadius }]}
            >
              <Text style={[styles.signOutLabel, { color: theme.ink }]}>{S.theme}</Text>
              <View style={styles.themeRowRight}>
                <View style={[styles.themeDot, { backgroundColor: theme.accent }]} />
                <Text style={{ fontSize: 14, color: theme.sub, fontFamily: 'IBMPlexSansKR_400Regular' }}>
                  {PALETTES[paletteKey].label} · {LAYOUTS[layoutKey].label}
                </Text>
              </View>
            </Pressable>
            <View style={{ gap: 14 }}>
              <Pressable
                onPress={onSignOut}
                disabled={state === 'signingOut'}
                style={[
                  styles.signOutButton,
                  frameStyle(theme),
                  // Layer: a plain filled button -- the faint edge is for rows, not this.
                  conceptOf(theme) === 'layer' && allEdges(0, 'transparent'),
                  { borderRadius: theme.btnRadius, opacity: state === 'signingOut' ? 0.6 : 1 }]}
              >
                {state === 'signingOut' ? (
                  <ActivityIndicator color={theme.ink} />
                ) : (
                  <Text style={[styles.signOutLabel, { color: theme.ink }]}>{S.signOut}</Text>
                )}
              </Pressable>
              <Pressable onPress={() => setState('confirmingDelete')} style={styles.deleteLinkButton}>
                <Text style={[styles.deleteLinkLabel, { color: theme.sub }]}>{isGuest ? S.deleteGuestData : S.leave}</Text>
              </Pressable>
            </View>

            <View style={styles.policyRow}>
              <Pressable onPress={() => Linking.openURL(TERMS_URL)}>
                <Text style={[styles.policyLabel, { color: theme.sub }]}>{S.terms}</Text>
              </Pressable>
              <Text style={[styles.policyDivider, { color: theme.line }]}>·</Text>
              <Pressable onPress={() => Linking.openURL(PRIVACY_URL)}>
                <Text style={[styles.policyLabel, { color: theme.sub }]}>{S.privacy}</Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  linkBox: { padding: 16, gap: 8 },
  langList: { paddingHorizontal: 16, paddingTop: 8, gap: 2 },
  langRow: { paddingVertical: 8 },
  linkButtons: { flexDirection: 'row', gap: 8, marginTop: 4 },
  subWarning: { fontSize: 13, lineHeight: 19, fontFamily: 'IBMPlexSansKR_500Medium' },
  subLink: { fontSize: 13, fontFamily: 'IBMPlexSansKR_500Medium', textDecorationLine: 'underline' },
  screen: { flex: 1 },
  body: { flex: 1, justifyContent: 'space-between', paddingBottom: 32 },
  identity: { alignItems: 'center', marginTop: 40, gap: 6 },
  avatar: { width: 76, height: 76, borderRadius: 38 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  nickname: { fontSize: 19, marginTop: 12 },
  provider: { fontSize: 13, fontFamily: 'IBMPlexSansKR_400Regular' },
  signOutButton: {
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signOutLabel: { fontSize: 15, fontFamily: 'IBMPlexSansKR_500Medium' },
  themeRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 18 },
  themeRowRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  themeDot: { width: 8, height: 8, borderRadius: 4 },
  deleteLinkButton: { alignItems: 'center', paddingVertical: 6 },
  deleteLinkLabel: { fontSize: 12.5, fontFamily: 'IBMPlexSansKR_400Regular' },
  policyRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
  policyLabel: { fontSize: 12, fontFamily: 'IBMPlexSansKR_400Regular', textDecorationLine: 'underline' },
  policyDivider: { fontSize: 12 },
});
