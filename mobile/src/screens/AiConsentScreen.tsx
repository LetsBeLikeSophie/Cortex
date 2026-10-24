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
// The lines match the privacy policy's 국외이전 section (version 2026-10-30),
// in the formal register of a legal notice.
const S = strings({
  ko: {
    title: 'AI 분석 동의 (국외이전)',
    what: '저장한 사진·텍스트·링크와 메모를 AI로 분석해 제목·요약·태그를 생성합니다.',
    where: '이전받는 자: Anthropic PBC (미국). 저장, AI 정리, AI 검색, 모아서 만들기를 실행할 때마다 암호화된 연결로 전송합니다.',
    retention: '보유 기간: Anthropic 서버에서 최대 30일 이내에 삭제되며, AI 모델 학습에 사용되지 않습니다.',
    decline: '동의하지 않으셔도 저장과 단어 검색은 이용하실 수 있으며, AI 기능만 제한됩니다. 동의 여부는 프로필에서 언제든 변경할 수 있습니다.',
    policy: '개인정보처리방침 전문 보기',
    nowAgreed: '현재: 동의함',
    nowDeclined: '현재: 동의하지 않음',
    disagree: '동의하지 않음',
    agree: '동의합니다',
  },
  en: {
    title: 'Consent to AI analysis',
    what: 'Cortex sends your saved photos, text, links and notes to an AI service to generate titles, summaries and tags.',
    where: 'Recipient: Anthropic PBC (USA). Sent over an encrypted connection each time you save, re-organize with AI, use AI search or Combine.',
    retention: "Retention: deleted from Anthropic's servers within 30 days and not used to train AI models.",
    decline: 'If you decline, you can still save and search by keyword; only AI features are unavailable. You can change your choice at any time in your profile.',
    policy: 'Read the full privacy policy',
    nowAgreed: 'Current: agreed',
    nowDeclined: 'Current: declined',
    disagree: 'Decline',
    agree: 'I agree',
  },
  ja: {
    title: 'AI分析への同意(国外移転)',
    what: '保存した写真・テキスト・リンク・メモをAIで分析し、タイトル・要約・タグを作成します。',
    where: '提供先: Anthropic PBC(米国)。保存、AI整理、AI検索、「まとめて作る」の実行時に、暗号化された通信で送信します。',
    retention: '保存期間: Anthropicのサーバーから最大30日以内に削除され、AIモデルの学習には使用されません。',
    decline: '同意しない場合も、保存とキーワード検索はご利用いただけます。AI機能のみご利用いただけません。同意はプロフィールからいつでも変更できます。',
    policy: 'プライバシーポリシー全文を見る',
    nowAgreed: '現在: 同意済み',
    nowDeclined: '現在: 同意していません',
    disagree: '同意しない',
    agree: '同意する',
  },
  'zh-Hans': {
    title: 'AI 分析授权（跨境传输）',
    what: '您保存的照片、文字、链接和备注将发送给 AI 进行分析，用于生成标题、摘要和标签。',
    where: '接收方：Anthropic PBC（美国）。在保存、AI 整理、AI 搜索及汇总生成时，通过加密连接发送。',
    retention: '保存期限：最多 30 天内从 Anthropic 服务器删除，且不会用于训练 AI 模型。',
    decline: '若不同意，您仍可保存内容并按关键词搜索，仅 AI 功能无法使用。您可随时在个人资料中更改。',
    policy: '查看完整隐私政策',
    nowAgreed: '当前：已同意',
    nowDeclined: '当前：未同意',
    disagree: '不同意',
    agree: '同意',
  },
  'zh-Hant': {
    title: 'AI 分析授權（跨境傳輸）',
    what: '您儲存的照片、文字、連結和備註將傳送給 AI 進行分析，用於產生標題、摘要和標籤。',
    where: '接收方：Anthropic PBC（美國）。在儲存、AI 整理、AI 搜尋及彙整生成時，透過加密連線傳送。',
    retention: '保存期限：最多 30 天內從 Anthropic 伺服器刪除，且不會用於訓練 AI 模型。',
    decline: '若不同意，您仍可儲存內容並依關鍵字搜尋，僅 AI 功能無法使用。您可隨時在個人資料中變更。',
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
