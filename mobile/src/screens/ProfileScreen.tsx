import React, { useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useTheme } from '../theme/ThemeContext';
import { emToTracking } from '../theme/themes';
import { useAuth } from '../auth/AuthContext';
import { signOut } from '../auth/kakaoLogin';
import { BackIcon, ProfileIcon } from '../components/Icons';
import type { RootStackParamList } from '../navigation/types';

export default function ProfileScreen() {
  const { theme } = useTheme();
  const { session } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [signingOut, setSigningOut] = useState(false);
  const card = theme.list === 'card';

  const meta = session?.user.user_metadata as { nickname?: string; avatar_url?: string } | undefined;
  const nickname = meta?.nickname ?? '이름 없음';
  const avatarUrl = meta?.avatar_url;

  const onSignOut = async () => {
    setSigningOut(true);
    await signOut();
    // No need to reset signingOut/navigate on success -- AuthContext's
    // session flips to null and App.tsx swaps this whole stack for
    // LoginScreen. If signOut ever throws, falling through to idle here
    // would be the fix, but supabase-js's signOut clears local state even
    // when the network call fails, so this path is effectively always hit.
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

        <Pressable
          onPress={onSignOut}
          disabled={signingOut}
          style={[styles.signOutButton, { borderColor: theme.line, opacity: signingOut ? 0.6 : 1 }]}
        >
          {signingOut ? (
            <ActivityIndicator color={theme.ink} />
          ) : (
            <Text style={[styles.signOutLabel, { color: theme.ink }]}>로그아웃</Text>
          )}
        </Pressable>
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
});
