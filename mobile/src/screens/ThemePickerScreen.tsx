import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useTheme } from '../theme/ThemeContext';
import { THEME_ORDER, THEMES, ThemeKey } from '../theme/themes';
import { CheckIcon } from '../components/Icons';
import { signOut } from '../auth/kakaoLogin';
import type { RootStackParamList } from '../navigation/types';

// The design's own top comparison bar ("상단 칩을 눌러 5가지 테마를 전환") — reworked
// from a canvas-preview affordance into the real in-app theme switcher the chat
// asked for ("앱 내에서 테마로 바꿀 수 있는 수준으로").
export default function ThemePickerScreen() {
  const { theme, themeKey, setThemeKey } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const card = theme.list === 'card';

  const pick = (key: ThemeKey) => {
    setThemeKey(key);
    navigation.goBack();
  };

  return (
    <View style={StyleSheet.absoluteFill}>
      <Pressable style={StyleSheet.absoluteFill} onPress={() => navigation.goBack()}>
        <BlurView
          intensity={18}
          tint={theme.dark ? 'dark' : 'light'}
          style={[StyleSheet.absoluteFill, { backgroundColor: theme.dark ? 'rgba(4,5,7,0.5)' : 'rgba(20,20,15,0.28)' }]}
        />
      </Pressable>

      <View
        style={[
          styles.sheet,
          {
            backgroundColor: theme.bg,
            borderTopLeftRadius: card ? 30 : 26,
            borderTopRightRadius: card ? 30 : 26,
            paddingBottom: 24 + insets.bottom,
            shadowOpacity: theme.dark ? 0.45 : 0.14,
          },
        ]}
      >
        <View style={[styles.grabber, { backgroundColor: theme.sub }]} />
        <Text style={[styles.heading, { color: theme.ink, fontFamily: theme.headFamily, fontWeight: theme.headWeight }]}>
          테마
        </Text>

        {THEME_ORDER.map((key) => {
          const t = THEMES[key];
          const active = key === themeKey;
          return (
            <Pressable
              key={key}
              onPress={() => pick(key)}
              style={[styles.row, { borderColor: active ? theme.ink : theme.line, backgroundColor: active ? theme.soft : 'transparent' }]}
            >
              <View style={[styles.dot, { backgroundColor: t.accent }]} />
              <View style={styles.rowBody}>
                <Text style={[styles.rowLabel, { color: theme.ink }]}>{t.label}</Text>
                <Text style={[styles.rowNote, { color: theme.sub }]}>{t.note}</Text>
              </View>
              {active && <CheckIcon size={18} color={theme.ink} strokeWidth={1.7} />}
            </Pressable>
          );
        })}

        <Pressable style={styles.signOutRow} onPress={() => signOut()}>
          <Text style={[styles.signOutLabel, { color: theme.sub }]}>로그아웃</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingTop: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowRadius: 24,
    elevation: 16,
  },
  grabber: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 18 },
  heading: { fontSize: 20, marginBottom: 14, paddingHorizontal: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, borderWidth: 1, marginBottom: 8 },
  dot: { width: 14, height: 14, borderRadius: 7 },
  rowBody: { flex: 1 },
  rowLabel: { fontSize: 15, fontFamily: 'IBMPlexSansKR_500Medium' },
  rowNote: { fontSize: 12, marginTop: 3, fontFamily: 'IBMPlexSansKR_400Regular', lineHeight: 17 },
  signOutRow: { alignItems: 'center', paddingVertical: 16, marginTop: 4 },
  signOutLabel: { fontSize: 13.5, fontFamily: 'IBMPlexSansKR_400Regular' },
});
