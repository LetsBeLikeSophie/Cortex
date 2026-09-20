import React, { useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useTheme } from '../theme/ThemeContext';
import { emToTracking } from '../theme/themes';
import { useAuth } from '../auth/AuthContext';
import { signOut } from '../auth/kakaoLogin';
import { deleteAccount } from '../api/client';
import { BackIcon, ProfileIcon } from '../components/Icons';
import type { RootStackParamList } from '../navigation/types';

type FooterState = 'idle' | 'signingOut' | 'confirmingDelete' | 'deleting' | 'deleteError';

export default function ProfileScreen() {
  const { theme } = useTheme();
  const { session } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [state, setState] = useState<FooterState>('idle');
  const [error, setError] = useState('');
  const card = theme.list === 'card';

  const meta = session?.user.user_metadata as { nickname?: string; avatar_url?: string } | undefined;
  const nickname = meta?.nickname ?? '이름 없음';
  const avatarUrl = meta?.avatar_url;

  const onSignOut = async () => {
    setState('signingOut');
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
      await signOut(); // clears the now-pointless local session -> LoginScreen
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setState('deleteError');
    }
  };

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: theme.bg }]} edges={['top']}>
      <View style={[styles.header, { paddingHorizontal: card ? 24 : 26 }]}>
        <Pressable onPress={() => navigation.goBack()} style={[styles.backButton, { borderColor: theme.line }]} hitSlop={8}>
          <BackIcon size={16} color={theme.ink} strokeWidth={1.5} />
        </Pressable>
        <Text
          style={{
            fontFamily: theme.headFamily,
            fontWeight: theme.headWeight,
            fontSize: theme.headSize - 8,
            color: theme.ink,
            letterSpacing: emToTracking(-0.02, theme.headSize - 8),
          }}
        >
          내 계정
        </Text>
      </View>

      <View style={[styles.body, { paddingHorizontal: card ? 24 : 26 }]}>
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
          <Text style={[styles.provider, { color: theme.sub }]}>카카오 계정으로 로그인됨</Text>
        </View>

        {state === 'confirmingDelete' || state === 'deleting' || state === 'deleteError' ? (
          <View style={[styles.confirmCard, { borderColor: theme.line, backgroundColor: card ? theme.surface : 'transparent' }]}>
            <Text style={[styles.confirmTitle, { color: theme.ink }]}>정말 탈퇴하시겠어요?</Text>
            <Text style={[styles.confirmBody, { color: theme.sub }]}>
              저장된 기억이 모두 사라지고, 되돌릴 수 없어요.
            </Text>
            {state === 'deleteError' && (
              <Text style={[styles.errorText, { color: theme.accent }]}>탈퇴 실패: {error}</Text>
            )}
            <View style={styles.confirmButtonRow}>
              <Pressable
                onPress={() => setState('idle')}
                disabled={state === 'deleting'}
                style={[styles.ghostButton, { borderColor: theme.line }]}
              >
                <Text style={[styles.ghostButtonLabel, { color: theme.ink }]}>취소</Text>
              </Pressable>
              <Pressable
                onPress={onConfirmDelete}
                disabled={state === 'deleting'}
                style={[styles.deleteButton, { opacity: state === 'deleting' ? 0.7 : 1 }]}
              >
                {state === 'deleting' ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.deleteButtonLabel}>탈퇴하기</Text>
                )}
              </Pressable>
            </View>
          </View>
        ) : (
          // Theme sits in its own group, well clear of sign-out/delete --
          // matching borders on adjacent buttons with only a small gap
          // read as one connected control and invited mis-taps.
          <View style={{ gap: 28 }}>
            <Pressable
              onPress={() => navigation.navigate('ThemePicker')}
              style={[styles.signOutButton, styles.themeRow, { borderColor: theme.line }]}
            >
              <Text style={[styles.signOutLabel, { color: theme.ink }]}>테마</Text>
              <View style={styles.themeRowRight}>
                <View style={[styles.themeDot, { backgroundColor: theme.accent }]} />
                <Text style={{ fontSize: 14, color: theme.sub, fontFamily: 'IBMPlexSansKR_400Regular' }}>{theme.label}</Text>
              </View>
            </Pressable>
            <View style={{ gap: 14 }}>
              <Pressable
                onPress={onSignOut}
                disabled={state === 'signingOut'}
                style={[styles.signOutButton, { borderColor: theme.line, opacity: state === 'signingOut' ? 0.6 : 1 }]}
              >
                {state === 'signingOut' ? (
                  <ActivityIndicator color={theme.ink} />
                ) : (
                  <Text style={[styles.signOutLabel, { color: theme.ink }]}>로그아웃</Text>
                )}
              </Pressable>
              <Pressable onPress={() => setState('confirmingDelete')} style={styles.deleteLinkButton}>
                <Text style={[styles.deleteLinkLabel, { color: theme.sub }]}>회원 탈퇴</Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingTop: 20, paddingBottom: 18 },
  backButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, justifyContent: 'space-between', paddingBottom: 32 },
  identity: { alignItems: 'center', marginTop: 40, gap: 6 },
  avatar: { width: 76, height: 76, borderRadius: 38 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  nickname: { fontSize: 19, marginTop: 12 },
  provider: { fontSize: 13, fontFamily: 'IBMPlexSansKR_400Regular' },
  signOutButton: {
    borderWidth: 1,
    borderRadius: 14,
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
  confirmCard: { borderWidth: 1, borderRadius: 16, padding: 18, gap: 6 },
  confirmTitle: { fontSize: 15.5, fontFamily: 'IBMPlexSansKR_500Medium' },
  confirmBody: { fontSize: 13, lineHeight: 19, fontFamily: 'IBMPlexSansKR_400Regular' },
  errorText: { fontSize: 12.5, marginTop: 6, fontFamily: 'IBMPlexSansKR_400Regular' },
  confirmButtonRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  ghostButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  ghostButtonLabel: { fontSize: 14, fontFamily: 'IBMPlexSansKR_500Medium' },
  deleteButton: {
    flex: 1,
    backgroundColor: '#c0392b',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  deleteButtonLabel: { fontSize: 14, color: '#fff', fontFamily: 'IBMPlexSansKR_500Medium' },
});
