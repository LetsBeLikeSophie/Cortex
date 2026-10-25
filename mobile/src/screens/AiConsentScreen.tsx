import React, { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';

import { useTheme } from '../theme/ThemeContext';
import { fetchPlan, friendlyError, setAiConsent } from '../api/client';
import { discardUnreceivedShares, drainShareQueue } from '../share/shareQueue';
import { ModalSheet } from '../components/ModalSheet';
import { Heading } from '../components/Typography';
import { ButtonRow, GhostButton, SolidButton } from '../components/Buttons';
import { PRIVACY_URL, strings } from '../i18n';

// Consent to send saved content to the AI provider abroad. Asked once after
// login, again whenever an AI feature is used without it, and changeable
// from the profile. Declining keeps saving and word search; only AI is off.
// The lines match the privacy policy's 국외이전 section (version 2026-10-30),
// in the formal register of a legal notice.
const S = strings({
  ko: {
    title: 'AI 분석 동의 (국외이전)',
    what: '저장한 사진·텍스트·링크와 메모를 AI로 분석해 제목·요약·태그를 생성합니다.',
    rows: [['받는 곳', 'Anthropic PBC (미국)'], ['보내는 내용', '저장한 사진·텍스트·링크·메모, 검색 문장'], ['보내는 때', '저장, AI 정리, AI 검색, 모아서 만들기 실행 시 (암호화 전송)'], ['보관 기간', '최대 30일 이내 삭제 · AI 학습에 사용되지 않음']] as [string, string][],
    decline: '동의하지 않으셔도 저장과 단어 검색은 이용하실 수 있습니다. 동의 여부는 프로필에서 언제든 변경할 수 있습니다.',
    policy: '개인정보처리방침 전문 보기',
    nowAgreed: '현재: 동의함',
    nowDeclined: '현재: 동의하지 않음',
    disagree: '동의하지 않음',
    agree: '동의합니다',
  },
  en: {
    title: 'Consent to AI analysis',
    what: 'Cortex sends your saved photos, text, links and notes to an AI service to generate titles, summaries and tags.',
    rows: [['Recipient', 'Anthropic PBC (USA)'], ['What is sent', 'Saved photos, text, links, notes and search sentences'], ['When', 'On save, AI re-organize, AI search and Combine (encrypted)'], ['Retention', 'Deleted within 30 days · not used to train AI']] as [string, string][],
    decline: 'If you decline, saving and keyword search still work. You can change this at any time in your profile.',
    policy: 'Read the full privacy policy',
    nowAgreed: 'Current: agreed',
    nowDeclined: 'Current: declined',
    disagree: 'Decline',
    agree: 'I agree',
  },
  ja: {
    title: 'AI分析への同意(国外移転)',
    what: '保存した写真・テキスト・リンク・メモをAIで分析し、タイトル・要約・タグを作成します。',
    rows: [['提供先', 'Anthropic PBC(米国)'], ['送る内容', '保存した写真・テキスト・リンク・メモ、検索文'], ['送るとき', '保存、AI整理、AI検索、「まとめて作る」の実行時(暗号化通信)'], ['保存期間', '最大30日以内に削除 · AIの学習には使用されません']] as [string, string][],
    decline: '同意しない場合も、保存とキーワード検索はご利用いただけます。同意はプロフィールからいつでも変更できます。',
    policy: 'プライバシーポリシー全文を見る',
    nowAgreed: '現在: 同意済み',
    nowDeclined: '現在: 同意していません',
    disagree: '同意しない',
    agree: '同意する',
  },
  'zh-Hans': {
    title: 'AI 分析授权（跨境传输）',
    what: '您保存的照片、文字、链接和备注将发送给 AI 进行分析，用于生成标题、摘要和标签。',
    rows: [['接收方', 'Anthropic PBC（美国）'], ['发送内容', '保存的照片、文字、链接、备注及搜索语句'], ['发送时机', '保存、AI 整理、AI 搜索及汇总生成时（加密传输）'], ['保存期限', '最多 30 天内删除 · 不用于训练 AI']] as [string, string][],
    decline: '若不同意，您仍可保存内容并按关键词搜索。可随时在个人资料中更改。',
    policy: '查看完整隐私政策',
    nowAgreed: '当前：已同意',
    nowDeclined: '当前：未同意',
    disagree: '不同意',
    agree: '同意',
  },
  'zh-Hant': {
    title: 'AI 分析授權（跨境傳輸）',
    what: '您儲存的照片、文字、連結和備註將傳送給 AI 進行分析，用於產生標題、摘要和標籤。',
    rows: [['接收方', 'Anthropic PBC（美國）'], ['傳送內容', '儲存的照片、文字、連結、備註及搜尋語句'], ['傳送時機', '儲存、AI 整理、AI 搜尋及彙整生成時（加密傳輸）'], ['保存期限', '最多 30 天內刪除 · 不用於訓練 AI']] as [string, string][],
    decline: '若不同意，您仍可儲存內容並依關鍵字搜尋。可隨時在個人資料中變更。',
    policy: '查看完整隱私權政策',
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
      // Photos shared in (Mehh) wait on this answer: agreed -> Mehh hears
      // "received" and they save; declined -> the copies are deleted and
      // Mehh keeps its originals.
      if (agree) drainShareQueue();
      else discardUnreceivedShares();
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
        <View style={styles.rows}>
          {S.rows.map(([label, value]) => (
            <View key={label} style={styles.row}>
              <Text style={[styles.label, { color: theme.sub }]}>{label}</Text>
              <Text style={[styles.value, { color: theme.ink }]}>{value}</Text>
            </View>
          ))}
        </View>
        <Text style={[styles.note, { color: theme.sub }]}>{S.decline}</Text>
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
  rows: { gap: 8, marginTop: 4 },
  row: { flexDirection: 'row', gap: 12 },
  label: { width: 76, fontSize: 13, lineHeight: 20, fontFamily: 'IBMPlexSansKR_500Medium' },
  value: { flex: 1, fontSize: 13.5, lineHeight: 20, fontFamily: 'IBMPlexSansKR_400Regular' },
  note: { fontSize: 12.5, lineHeight: 19, marginTop: 4, fontFamily: 'IBMPlexSansKR_400Regular' },
  link: { fontSize: 13.5, marginTop: 14, fontFamily: 'IBMPlexSansKR_500Medium', textDecorationLine: 'underline' },
  now: { fontSize: 12.5, marginTop: 10, paddingHorizontal: 4, fontFamily: 'IBMPlexSansKR_400Regular' },
  error: { fontSize: 12.5, marginTop: 12, paddingHorizontal: 4, fontFamily: 'IBMPlexSansKR_400Regular' },
  buttons: { marginTop: 18 },
});
