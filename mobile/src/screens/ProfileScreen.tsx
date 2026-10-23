import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useTheme } from '../theme/ThemeContext';
import { LAYOUTS, PALETTES, allEdges, conceptOf } from '../theme/themes';
import { useAuth } from '../auth/AuthContext';
import { signOut } from '../auth/kakaoLogin';
import { deleteAccount, fetchPlan, Plan, friendlyError } from '../api/client';
import { ProfileIcon } from '../components/Icons';
import { ScreenHeader } from '../components/ScreenHeader';
import { frameStyle, screenGutter } from '../components/Card';
import { ConfirmCard } from '../components/ConfirmCard';
import { PLAY_SUBSCRIPTIONS_URL, isLifetimePro } from '../billing/types';
import type { RootStackParamList } from '../navigation/types';

type FooterState = 'idle' | 'signingOut' | 'confirmingDelete' | 'deleting' | 'deleteError';

export default function ProfileScreen() {
  const { theme, layoutKey, paletteKey } = useTheme();
  const { session, pauseGuest } = useAuth();
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
        ? `무료 체험 · ${Math.max(0, Math.ceil((new Date(plan.trialEndsAt).getTime() - Date.now()) / 86400000))}일 남음`
        : plan
          ? `무료 · AI 정리 ${plan.classify.used}/${plan.classify.limit}`
          : '';

  const renewingPro = plan?.tier === 'pro' && !isLifetimePro(plan.proUntil);
  const isGuest = session?.user.is_anonymous ?? false;
  const meta = session?.user.user_metadata as { nickname?: string; avatar_url?: string } | undefined;
  const nickname = isGuest ? '게스트' : meta?.nickname ?? '이름 없음';
  const avatarUrl = isGuest ? undefined : meta?.avatar_url;

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
      <ScreenHeader title="내 계정" theme={theme} onBack={() => navigation.goBack()} />

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
            {isGuest ? '게스트로 이용 중' : '카카오 계정으로 로그인됨'}
          </Text>
        </View>

        {state === 'confirmingDelete' || state === 'deleting' || state === 'deleteError' ? (
          <ConfirmCard
            theme={theme}
            title={isGuest ? '정말 삭제하시겠어요?' : '정말 탈퇴하시겠어요?'}
            body={isGuest ? '이 게스트가 저장한 기억이 모두 사라지고, 되돌릴 수 없어요.' : '저장된 기억이 모두 사라지고, 되돌릴 수 없어요.'}
            confirmLabel={isGuest ? '삭제하기' : '탈퇴하기'}
            busy={state === 'deleting'}
            error={state === 'deleteError' ? `삭제 실패: ${error}` : undefined}
            onCancel={() => setState('idle')}
            onConfirm={onConfirmDelete}
          >
            {/* Deleting the account doesn't touch the Play subscription --
                it would keep billing. Say so before, with the way there. */}
            {renewingPro && (
              <>
                <Text style={[styles.subWarning, { color: theme.danger }]}>
                  탈퇴해도 Play 구독은 해지되지 않아요. 먼저 해지해 주세요.
                </Text>
                <Pressable onPress={() => Linking.openURL(PLAY_SUBSCRIPTIONS_URL).catch(() => {})} hitSlop={6}>
                  <Text style={[styles.subLink, { color: theme.ink }]}>구독 관리 열기</Text>
                </Pressable>
              </>
            )}
          </ConfirmCard>
        ) : (
          // Theme sits in its own group, well clear of sign-out/delete --
          // matching borders on adjacent buttons with only a small gap
          // read as one connected control and invited mis-taps.
          <View style={{ gap: 28 }}>
            <Pressable
              onPress={() => navigation.navigate('Paywall')}
              style={[styles.signOutButton, styles.themeRow, frameStyle(theme), { borderRadius: theme.cardRadius }]}
            >
              <Text style={[styles.signOutLabel, { color: theme.ink }]}>플랜</Text>
              <Text style={{ fontSize: 14, color: theme.sub, fontFamily: 'IBMPlexSansKR_400Regular' }}>{planLabel}</Text>
            </Pressable>
            <Pressable
              onPress={() => navigation.navigate('ThemePicker')}
              style={[styles.signOutButton, styles.themeRow, frameStyle(theme), { borderRadius: theme.cardRadius }]}
            >
              <Text style={[styles.signOutLabel, { color: theme.ink }]}>테마</Text>
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
                  <Text style={[styles.signOutLabel, { color: theme.ink }]}>로그아웃</Text>
                )}
              </Pressable>
              <Pressable onPress={() => setState('confirmingDelete')} style={styles.deleteLinkButton}>
                <Text style={[styles.deleteLinkLabel, { color: theme.sub }]}>{isGuest ? '게스트 데이터 삭제' : '회원 탈퇴'}</Text>
              </Pressable>
            </View>

            <View style={styles.policyRow}>
              <Pressable onPress={() => Linking.openURL('https://itssophie.dev/cortex/legal/terms.html')}>
                <Text style={[styles.policyLabel, { color: theme.sub }]}>이용약관</Text>
              </Pressable>
              <Text style={[styles.policyDivider, { color: theme.line }]}>·</Text>
              <Pressable onPress={() => Linking.openURL('https://itssophie.dev/cortex/legal/privacy.html')}>
                <Text style={[styles.policyLabel, { color: theme.sub }]}>개인정보처리방침</Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
