import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useTheme } from '../theme/ThemeContext';
import { completeOnboarding } from '../api/client';
import { loadHomeTabs, saveHomeTabs } from '../data/tabs';
import { USE_CASE_OPTIONS, UseCaseKey, markOnboarded } from '../data/onboarding';
import { CheckIcon } from '../components/Icons';
import { ModalSheet } from '../components/ModalSheet';
import { Heading } from '../components/Typography';
import { GhostButton, SolidButton } from '../components/Buttons';
import { showToast } from '../native/toast';
import type { RootStackParamList } from '../navigation/types';

// First-run "어디에 주로 쓰실 거예요?" sheet, opened once by Home for a
// basically-empty account. Picking use cases pins their tags as home tabs
// and seeds a few example items under those tags (server-side), so the
// strip opens onto something instead of empty tabs. Skipping is always
// fine -- it just leaves the default 가이드 tab and guide item.
export default function OnboardingScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [picked, setPicked] = useState<UseCaseKey[]>([]);
  const [busy, setBusy] = useState(false);

  const toggle = (key: UseCaseKey) =>
    setPicked((cur) => (cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]));

  const skip = () => {
    markOnboarded();
    navigation.goBack();
  };

  const finish = async () => {
    if (picked.length === 0 || busy) return;
    setBusy(true);
    try {
      // Keep the picks in on-screen order, not tap order, so the tab strip
      // reads the same way the options did.
      const ordered = USE_CASE_OPTIONS.map((o) => o.key).filter((k) => picked.includes(k));
      const { tabs } = await completeOnboarding(ordered);
      const current = await loadHomeTabs();
      await saveHomeTabs([...current, ...tabs.filter((t) => !current.includes(t))]);
      await markOnboarded();
      navigation.goBack(); // Home refetches items + tabs on focus
    } catch {
      showToast('지금은 준비하지 못했어요. 잠시 후 다시 시도해 주세요');
      setBusy(false);
    }
  };

  return (
    <ModalSheet theme={theme} onClose={skip} bordered={false} paddingBottom={24} paddingHorizontal={20} maxHeightRatio={0.85}>
      <Heading theme={theme} size={22} style={styles.heading}>
        어디에 주로 쓰실 거예요?
      </Heading>
      <Text style={[styles.sub, { color: theme.sub }]}>
        고르신 것에 맞춰 홈 탭과 예시 글을 미리 채워둘게요. 여러 개 골라도 돼요.
      </Text>

      <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
        {USE_CASE_OPTIONS.map((opt) => {
          const on = picked.includes(opt.key);
          return (
            <Pressable
              key={opt.key}
              onPress={() => toggle(opt.key)}
              disabled={busy}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              style={[
                styles.option,
                {
                  borderColor: on ? theme.accent : theme.line,
                  backgroundColor: on ? theme.accent + '14' : theme.surface,
                  borderRadius: Math.max(theme.cardRadius, 14),
                },
              ]}
            >
              <View style={styles.optionBody}>
                <Text style={[styles.optionLabel, { color: theme.ink }]}>{opt.label}</Text>
                <Text style={[styles.optionNote, { color: theme.sub }]}>{opt.note}</Text>
                <Text style={[styles.optionTabs, { color: on ? theme.accent : theme.sub }]}>
                  {opt.tabs.map((t) => `#${t}`).join('  ')}
                </Text>
              </View>
              <View
                style={[
                  styles.check,
                  { borderColor: on ? theme.accent : theme.line, backgroundColor: on ? theme.accent : 'transparent' },
                ]}
              >
                {on && <CheckIcon size={12} color="#fff" strokeWidth={2.4} />}
              </View>
            </Pressable>
          );
        })}
        <Text style={[styles.footnote, { color: theme.sub }]}>
          예시 글에는 모두 '예시' 태그가 붙어 있어서, 나중에 한 번에 찾아 지울 수 있어요.
        </Text>
      </ScrollView>

      <View style={styles.buttons}>
        <GhostButton label="건너뛰기" theme={theme} onPress={skip} disabled={busy} />
        {busy ? (
          <View style={[styles.busy, { borderColor: theme.line, borderRadius: theme.btnRadius }]}>
            <ActivityIndicator color={theme.accent} />
          </View>
        ) : (
          <SolidButton
            label={picked.length > 0 ? `${picked.length}개로 시작하기` : '시작하기'}
            theme={theme}
            onPress={finish}
            disabled={picked.length === 0}
          />
        )}
      </View>
    </ModalSheet>
  );
}

const styles = StyleSheet.create({
  heading: { paddingHorizontal: 4 },
  sub: { fontSize: 13.5, lineHeight: 20, marginTop: 8, marginBottom: 16, paddingHorizontal: 4, fontFamily: 'IBMPlexSansKR_400Regular' },
  list: { flexShrink: 1 },
  option: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, padding: 15, marginBottom: 9, gap: 12 },
  optionBody: { flex: 1 },
  optionLabel: { fontSize: 15.5, fontFamily: 'IBMPlexSansKR_500Medium' },
  optionNote: { fontSize: 12.5, marginTop: 3, fontFamily: 'IBMPlexSansKR_400Regular' },
  optionTabs: { fontSize: 12, marginTop: 8, fontFamily: 'IBMPlexSansKR_400Regular' },
  check: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  footnote: { fontSize: 12, lineHeight: 18, marginTop: 4, marginBottom: 6, paddingHorizontal: 4, fontFamily: 'IBMPlexSansKR_400Regular' },
  buttons: { flexDirection: 'row', gap: 10, marginTop: 14 },
  busy: { flex: 1.1, borderWidth: 1, alignItems: 'center', justifyContent: 'center', minHeight: 48 },
});
