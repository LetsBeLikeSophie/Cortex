import React, { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';

import { useTheme } from '../theme/ThemeContext';
import { fetchPlan, friendlyError, setAiConsent } from '../api/client';
import { ModalSheet } from '../components/ModalSheet';
import { Heading } from '../components/Typography';
import { ButtonRow, GhostButton, SolidButton } from '../components/Buttons';

// Consent to send saved content to the AI provider abroad. Asked once after
// login, again whenever an AI feature is used without it, and changeable
// from the profile. Declining keeps saving and word search; only AI is off.
// The lines match the privacy policy's 국외이전 section (version 2026-10-30).
const PRIVACY_URL = 'https://itssophie.dev/cortex/legal/privacy.html';

export default function AiConsentScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation();
  const [current, setCurrent] = useState<'agreed' | 'declined' | null | undefined>(undefined);
  const [busy, setBusy] = useState<'agree' | 'decline' | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchPlan()
      .then((p) => setCurrent(p.aiConsent ?? null))
      .catch(() => setCurrent(null));
  }, []);

  const answer = async (agree: boolean) => {
    setError('');
    setBusy(agree ? 'agree' : 'decline');
    try {
      await setAiConsent(agree);
      navigation.goBack();
    } catch (err) {
      setError(friendlyError(err));
      setBusy(null);
    }
  };

  // Closing without answering counts as no answer -- asked again next time.
  return (
    <ModalSheet theme={theme} onClose={busy ? () => {} : () => navigation.goBack()} paddingBottom={24} paddingHorizontal={20}>
      <Heading theme={theme} size={22} style={styles.pad}>
        AI 분석 동의
      </Heading>
      <View style={styles.lines}>
        <Text style={[styles.line, { color: theme.ink }]}>저장한 사진·글·링크와 메모를 AI로 보내 제목·태그를 만들어요.</Text>
        <Text style={[styles.line, { color: theme.ink }]}>받는 곳: Anthropic (미국) · 저장, AI 정리, AI 검색, 모아서 만들기 때마다</Text>
        <Text style={[styles.line, { color: theme.ink }]}>최대 30일 뒤 삭제되고, AI 학습에 쓰이지 않아요.</Text>
        <Text style={[styles.line, { color: theme.sub }]}>동의하지 않아도 저장·검색은 돼요. AI 기능만 꺼져요. 프로필에서 언제든 바꿀 수 있어요.</Text>
      </View>
      <Pressable onPress={() => Linking.openURL(PRIVACY_URL).catch(() => {})} hitSlop={6} style={styles.pad}>
        <Text style={[styles.link, { color: theme.ink }]}>개인정보처리방침 보기</Text>
      </Pressable>
      {current !== undefined && current !== null && (
        <Text style={[styles.now, { color: theme.sub }]}>{current === 'agreed' ? '지금: 동의함' : '지금: 동의 안 함'}</Text>
      )}
      {error !== '' && <Text style={[styles.error, { color: theme.danger }]}>{error}</Text>}
      <ButtonRow theme={theme} style={styles.buttons}>
        <GhostButton label="동의 안 함" theme={theme} onPress={() => answer(false)} disabled={busy !== null} />
        <SolidButton label="동의" theme={theme} onPress={() => answer(true)} loading={busy === 'agree'} disabled={busy !== null} />
      </ButtonRow>
    </ModalSheet>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: 4 },
  lines: { gap: 8, marginTop: 14, paddingHorizontal: 4 },
  line: { fontSize: 14, lineHeight: 21, fontFamily: 'IBMPlexSansKR_400Regular' },
  link: { fontSize: 13.5, marginTop: 14, fontFamily: 'IBMPlexSansKR_500Medium', textDecorationLine: 'underline' },
  now: { fontSize: 12.5, marginTop: 10, paddingHorizontal: 4, fontFamily: 'IBMPlexSansKR_400Regular' },
  error: { fontSize: 12.5, marginTop: 12, paddingHorizontal: 4, fontFamily: 'IBMPlexSansKR_400Regular' },
  buttons: { marginTop: 18 },
});
