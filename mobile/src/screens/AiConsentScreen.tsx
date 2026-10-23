import React, { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';

import { useTheme } from '../theme/ThemeContext';
import { fetchPlan, friendlyError, setAiConsent } from '../api/client';
import { ModalSheet } from '../components/ModalSheet';
import { Heading } from '../components/Typography';
import { ButtonRow, GhostButton, SolidButton } from '../components/Buttons';
import { PRIVACY_URL, strings } from '../i18n';

// Consent to send saved content to the AI provider abroad. Asked once after
// login, again whenever an AI feature is used without it, and changeable
// from the profile. Declining keeps saving and word search; only AI is off.
// The lines match the privacy policy's 국외이전 section (version 2026-10-30).
const S = strings({
  ko: {
    title: 'AI 분석 동의',
    what: '저장한 사진·글·링크와 메모를 AI로 보내 제목·태그를 만들어요.',
    where: '받는 곳: Anthropic (미국) · 저장, AI 정리, AI 검색, 모아서 만들기 때마다',
    retention: '최대 30일 뒤 삭제되고, AI 학습에 쓰이지 않아요.',
    decline: '동의하지 않아도 저장·검색은 돼요. AI 기능만 꺼져요. 프로필에서 언제든 바꿀 수 있어요.',
    policy: '개인정보처리방침 보기',
    nowAgreed: '지금: 동의함',
    nowDeclined: '지금: 동의 안 함',
    disagree: '동의 안 함',
    agree: '동의',
  },
  en: {
    title: 'AI analysis consent',
    what: 'Your saved photos, text, links and notes are sent to an AI to make titles and tags.',
    where: 'Sent to: Anthropic (USA) · each time you save, sort with AI, use AI search or Combine',
    retention: 'Deleted within 30 days, and never used to train AI.',
    decline: "If you decline, saving and word search still work. Only AI features turn off. You can change this anytime in your profile.",
    policy: 'View privacy policy',
    nowAgreed: 'Now: agreed',
    nowDeclined: 'Now: declined',
    disagree: 'Decline',
    agree: 'Agree',
  },
  ja: {
    title: 'AI分析への同意',
    what: '保存した写真・テキスト・リンクとメモをAIに送り、タイトルとタグを作ります。',
    where: '送信先: Anthropic(米国) · 保存、AI整理、AI検索、「まとめて作る」のたびに',
    retention: '最大30日後に削除され、AIの学習には使われません。',
    decline: '同意しなくても保存と検索は使えます。AI機能だけがオフになります。プロフィールからいつでも変更できます。',
    policy: 'プライバシーポリシーを見る',
    nowAgreed: '現在: 同意済み',
    nowDeclined: '現在: 同意していません',
    disagree: '同意しない',
    agree: '同意する',
  },
  'zh-Hans': {
    title: 'AI 分析授权',
    what: '你保存的照片、文字、链接和备注会发送给 AI，用于生成标题和标签。',
    where: '接收方：Anthropic（美国）· 每次保存、AI 整理、AI 搜索、汇总生成时',
    retention: '最多 30 天后删除，且不会用于训练 AI。',
    decline: '不同意也能保存和按词搜索，只是 AI 功能会关闭。可随时在个人资料中更改。',
    policy: '查看隐私政策',
    nowAgreed: '当前：已同意',
    nowDeclined: '当前：未同意',
    disagree: '不同意',
    agree: '同意',
  },
  'zh-Hant': {
    title: 'AI 分析授權',
    what: '你儲存的照片、文字、連結和備註會傳送給 AI，用來產生標題和標籤。',
    where: '接收方：Anthropic（美國）· 每次儲存、AI 整理、AI 搜尋、彙整生成時',
    retention: '最多 30 天後刪除，且不會用於訓練 AI。',
    decline: '不同意也能儲存和依字詞搜尋，只是 AI 功能會關閉。可隨時在個人資料中變更。',
    policy: '查看隱私權政策',
    nowAgreed: '目前：已同意',
    nowDeclined: '目前：未同意',
    disagree: '不同意',
    agree: '同意',
  },
});

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
        {S.title}
      </Heading>
      <View style={styles.lines}>
        <Text style={[styles.line, { color: theme.ink }]}>{S.what}</Text>
        <Text style={[styles.line, { color: theme.ink }]}>{S.where}</Text>
        <Text style={[styles.line, { color: theme.ink }]}>{S.retention}</Text>
        <Text style={[styles.line, { color: theme.sub }]}>{S.decline}</Text>
      </View>
      <Pressable onPress={() => Linking.openURL(PRIVACY_URL).catch(() => {})} hitSlop={6} style={styles.pad}>
        <Text style={[styles.link, { color: theme.ink }]}>{S.policy}</Text>
      </Pressable>
      {current !== undefined && current !== null && (
        <Text style={[styles.now, { color: theme.sub }]}>{current === 'agreed' ? S.nowAgreed : S.nowDeclined}</Text>
      )}
      {error !== '' && <Text style={[styles.error, { color: theme.danger }]}>{error}</Text>}
      <ButtonRow theme={theme} style={styles.buttons}>
        <GhostButton label={S.disagree} theme={theme} onPress={() => answer(false)} disabled={busy !== null} />
        <SolidButton label={S.agree} theme={theme} onPress={() => answer(true)} loading={busy === 'agree'} disabled={busy !== null} />
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
