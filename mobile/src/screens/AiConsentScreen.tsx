import React, { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';

import { useTheme } from '../theme/ThemeContext';
import { fetchPlan, friendlyError, setAiConsent } from '../api/client';
import { discardUnreceivedShares, drainShareQueue, saveSharesWithoutAi, setDeclinedChoice, waitingShareCount, useShareQueue } from '../share/shareQueue';
import { showToast } from '../native/toast';
import { ModalSheet } from '../components/ModalSheet';
import { Heading } from '../components/Typography';
import { ButtonRow, GhostButton, SolidButton } from '../components/Buttons';
import { PRIVACY_URL, strings } from '../i18n';

import { BODY_KR, BODY_KR_MEDIUM } from '../theme/themes';
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
    sharedWaiting: (n: number) => `받은 사진 ${n}장은 동의하면 저장돼요 · 동의하지 않으면 미분류함에 저장할지 물어봐요`,
    keepTitle: (n: number) => `받은 사진 ${n}장을 미분류함에 저장할까요?`,
    keepNote: 'AI에는 보내지 않아요. 저장하지 않으면 Mehh에 그대로 남아요.',
    keepYes: '저장',
    keepNo: '저장 안 함',
    kept: (n: number) => `사진 ${n}장을 미분류함에 저장해요`,
    sharedDropped: (n: number) => `사진 ${n}장은 저장하지 않았어요 · Mehh에 그대로 있어요`,
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
    sharedWaiting: (n: number) => `The ${n} photo${n === 1 ? '' : 's'} you sent will be saved if you agree · if not, you'll be asked whether to keep them in Unsorted`,
    keepTitle: (n: number) => `Keep the ${n} photo${n === 1 ? '' : 's'} you sent in Unsorted?`,
    keepNote: "They won't be sent to the AI. If not kept, they stay in Mehh.",
    keepYes: 'Keep',
    keepNo: "Don't keep",
    kept: (n: number) => `Keeping ${n} photo${n === 1 ? '' : 's'} in Unsorted`,
    sharedDropped: (n: number) => `${n} photo${n === 1 ? '' : 's'} not saved · still in Mehh`,
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
    sharedWaiting: (n: number) => `受け取った写真${n}枚は同意すると保存されます · 同意しない場合は未分類に保存するか確認します`,
    keepTitle: (n: number) => `受け取った写真${n}枚を未分類に保存しますか？`,
    keepNote: 'AIには送りません。保存しない場合はMehhにそのまま残ります。',
    keepYes: '保存',
    keepNo: '保存しない',
    kept: (n: number) => `写真${n}枚を未分類に保存します`,
    sharedDropped: (n: number) => `写真${n}枚は保存しませんでした · Mehhに残っています`,
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
    sharedWaiting: (n: number) => `收到的 ${n} 张照片在同意后会保存 · 不同意时会问你是否存入未分类`,
    keepTitle: (n: number) => `要把收到的 ${n} 张照片存入未分类吗？`,
    keepNote: '不会发送给 AI。不保存的话，照片仍留在 Mehh。',
    keepYes: '保存',
    keepNo: '不保存',
    kept: (n: number) => `正在把 ${n} 张照片存入未分类`,
    sharedDropped: (n: number) => `${n} 张照片未保存 · 仍在 Mehh 中`,
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
    sharedWaiting: (n: number) => `收到的 ${n} 張照片在同意後會儲存 · 不同意時會問你是否存入未分類`,
    keepTitle: (n: number) => `要把收到的 ${n} 張照片存入未分類嗎？`,
    keepNote: '不會傳送給 AI。不儲存的話，照片仍留在 Mehh。',
    keepYes: '儲存',
    keepNo: '不儲存',
    kept: (n: number) => `正在把 ${n} 張照片存入未分類`,
    sharedDropped: (n: number) => `${n} 張照片未儲存 · 仍在 Mehh 中`,
  },
});

export default function AiConsentScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation();
  const [current, setCurrent] = useState<'agreed' | 'declined' | null | undefined>(undefined);
  const [busy, setBusy] = useState<'agree' | 'decline' | null>(null);
  const [error, setError] = useState('');
  // Set after a decline while shared photos wait: how many to ask about.
  const [askKeep, setAskKeep] = useState<number | null>(null);
  // Photos shared in (Mehh) that wait on this answer.
  const shareQueue = useShareQueue();

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
      if (agree) {
        drainShareQueue();
        navigation.goBack();
        return;
      }
      // Declined with photos waiting: ask once whether to keep them in
      // 미분류함 without AI (decision C) before closing.
      const waiting = await waitingShareCount();
      if (waiting > 0) {
        setAskKeep(waiting);
        setBusy(null);
        return;
      }
      navigation.goBack();
    } catch (err) {
      setError(friendlyError(err));
      setBusy(null);
    }
  };

  const keep = async (yes: boolean) => {
    if (askKeep === null) return;
    setBusy(yes ? 'agree' : 'decline');
    // Remembered: later shares while AI stays declined follow this answer
    // without asking (decision M2; changeable in the profile).
    setDeclinedChoice(yes ? 'keep' : 'drop');
    if (yes) {
      showToast(S.kept(askKeep));
      saveSharesWithoutAi();
    } else {
      const n = await discardUnreceivedShares();
      if (n > 0) showToast(S.sharedDropped(n));
    }
    navigation.goBack();
  };

  // Declined, and shared photos are waiting: the one follow-up question.
  // Closing here keeps them waiting -- asked again from Home's line.
  if (askKeep !== null) {
    return (
      <ModalSheet theme={theme} onClose={busy ? () => {} : () => navigation.goBack()} paddingBottom={24} paddingHorizontal={20}>
        <Heading theme={theme} size={22} style={styles.pad}>
          {S.keepTitle(askKeep)}
        </Heading>
        <View style={styles.lines}>
          <Text style={[styles.line, { color: theme.sub }]}>{S.keepNote}</Text>
        </View>
        <ButtonRow theme={theme} style={styles.buttons}>
          <GhostButton label={S.keepNo} theme={theme} onPress={() => keep(false)} disabled={busy !== null} />
          <SolidButton label={S.keepYes} theme={theme} onPress={() => keep(true)} loading={busy === 'agree'} disabled={busy !== null} />
        </ButtonRow>
      </ModalSheet>
    );
  }

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
        {shareQueue.waitingConsent && shareQueue.pending > 0 && (
          <Text style={[styles.note, { color: theme.ink }]}>{S.sharedWaiting(shareQueue.pending)}</Text>
        )}
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
  line: { fontSize: 14, lineHeight: 21, fontFamily: BODY_KR },
  rows: { gap: 8, marginTop: 4 },
  row: { flexDirection: 'row', gap: 12 },
  label: { width: 76, fontSize: 13, lineHeight: 20, fontFamily: BODY_KR_MEDIUM },
  value: { flex: 1, fontSize: 13.5, lineHeight: 20, fontFamily: BODY_KR },
  note: { fontSize: 12.5, lineHeight: 19, marginTop: 4, fontFamily: BODY_KR },
  link: { fontSize: 13.5, marginTop: 14, fontFamily: BODY_KR_MEDIUM, textDecorationLine: 'underline' },
  now: { fontSize: 12.5, marginTop: 10, paddingHorizontal: 4, fontFamily: BODY_KR },
  error: { fontSize: 12.5, marginTop: 12, paddingHorizontal: 4, fontFamily: BODY_KR },
  buttons: { marginTop: 18 },
});
