import React, { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useTheme } from '../theme/ThemeContext';
import { ModalSheet } from '../components/ModalSheet';
import { Heading } from '../components/Typography';
import { ButtonRow, GhostButton, SolidButton } from '../components/Buttons';
import { CheckIcon } from '../components/Icons';
import { allEdges, OUTLINE, BODY_KR, BODY_KR_MEDIUM } from '../theme/themes';
import { ApiError, applyTagCleanup, asQuotaError, fetchPlan, fetchTags, friendlyError, Plan, suggestTagCleanup, TagMergeGroup } from '../api/client';
import { loadHomeTabs, saveHomeTabs } from '../data/tabs';
import { strings } from '../i18n';
import type { RootStackParamList } from '../navigation/types';

const S = strings({
  ko: {
    title: '태그 정리하기',
    intro: '비슷한 태그를 AI가 찾아 하나로 합쳐요',
    cost: '태그 이름만 보내요 · 1회 차감',
    merged: (n: number) => `합치면 메모 ${n}개`,
    start: '정리 제안 받기',
    monthLeft: (n: number) => ` · 이번 달 ${n}회 남음`,
    agreeAndStart: '동의하고 정리하기',
    consentNote: ' · AI 분석에 동의하면 쓸 수 있어요',
    finding: '비슷한 태그를 찾고 있어요',
    none: '합칠 만한 태그가 없어요. 이미 깔끔해요.',
    pick: '합칠 묶음을 골라 주세요',
    apply: (n: number) => `${n}개 묶음 합치기`,
    willChange: (n: number) => `메모 ${n}개의 태그가 바뀌어요 · 되돌릴 수 없어요`,
    applied: (n: number) => `메모 ${n}개의 태그를 정리했어요`,
    left: (n: number) => `이번 달 ${n}회 남음`,
    cancel: '취소',
    done: '확인',
  },
  en: {
    title: 'Tidy up tags',
    intro: 'AI finds look-alike tags and merges them into one',
    cost: 'Only tag names are sent · uses 1 this month',
    merged: (n: number) => `${n} item${n === 1 ? '' : 's'} once merged`,
    start: 'Get suggestions',
    monthLeft: (n: number) => ` · ${n} left this month`,
    agreeAndStart: 'Allow AI and tidy up',
    consentNote: ' · Allow AI analysis to use it',
    finding: 'Looking for look-alike tags',
    none: 'Nothing to merge. Your tags are already tidy.',
    pick: 'Pick the groups to merge',
    apply: (n: number) => `Merge ${n} ${n === 1 ? 'group' : 'groups'}`,
    willChange: (n: number) => `Tags change on ${n} item${n === 1 ? '' : 's'} · this can't be undone`,
    applied: (n: number) => `Tidied the tags of ${n} ${n === 1 ? 'memo' : 'memos'}`,
    left: (n: number) => `${n} left this month`,
    cancel: 'Cancel',
    done: 'OK',
  },
  ja: {
    title: 'タグを整理',
    intro: '似たタグをAIが見つけて1つにまとめます',
    cost: '送るのはタグ名だけ · 今月1回分',
    merged: (n: number) => `まとめるとメモ${n}件`,
    start: '整理の提案をもらう',
    monthLeft: (n: number) => ` · 今月残り${n}回`,
    agreeAndStart: '同意して整理する',
    consentNote: ' · AI分析に同意すると使えます',
    finding: '似たタグを探しています',
    none: '統合できるタグはありません。すでに整っています。',
    pick: '統合するグループを選んでください',
    apply: (n: number) => `${n}グループを統合`,
    willChange: (n: number) => `メモ${n}件のタグが変わります · 元に戻せません`,
    applied: (n: number) => `メモ${n}件のタグを整理しました`,
    left: (n: number) => `今月あと${n}回`,
    cancel: 'キャンセル',
    done: 'OK',
  },
  'zh-Hans': {
    title: '整理标签',
    intro: 'AI 找出相似标签并合并为一个',
    cost: '只发送标签名 · 本月计 1 次',
    merged: (n: number) => `合并后 ${n} 项`,
    start: '获取整理建议',
    monthLeft: (n: number) => ` · 本月剩 ${n} 次`,
    agreeAndStart: '同意并整理',
    consentNote: ' · 同意 AI 分析后即可使用',
    finding: '正在查找相似标签',
    none: '没有可合并的标签，已经很整齐了。',
    pick: '选择要合并的组',
    apply: (n: number) => `合并 ${n} 组`,
    willChange: (n: number) => `${n} 项内容的标签会改变 · 无法撤销`,
    applied: (n: number) => `已整理 ${n} 条笔记的标签`,
    left: (n: number) => `本月剩 ${n} 次`,
    cancel: '取消',
    done: '确定',
  },
  'zh-Hant': {
    title: '整理標籤',
    intro: 'AI 找出相似標籤並合併為一個',
    cost: '只傳送標籤名稱 · 本月計 1 次',
    merged: (n: number) => `合併後 ${n} 項`,
    start: '取得整理建議',
    monthLeft: (n: number) => ` · 本月剩 ${n} 次`,
    agreeAndStart: '同意並整理',
    consentNote: ' · 同意 AI 分析後即可使用',
    finding: '正在尋找相似標籤',
    none: '沒有可合併的標籤，已經很整齊了。',
    pick: '選擇要合併的組',
    apply: (n: number) => `合併 ${n} 組`,
    willChange: (n: number) => `${n} 項內容的標籤會改變 · 無法復原`,
    applied: (n: number) => `已整理 ${n} 則筆記的標籤`,
    left: (n: number) => `本月剩 ${n} 次`,
    cancel: '取消',
    done: '確定',
  },
});

type Step = 'intro' | 'finding' | 'pick' | 'applying' | 'done';

// The last suggestion, kept with the month it was bought in: a closed sheet
// (swipe, cancel, the app quitting) doesn't throw away a paid-for answer.
// Reopening this month shows it again; a successful merge clears it.
const SAVED_KEY = 'cortex.tagCleanupSuggestion';
const thisMonth = () => new Date().toISOString().slice(0, 7);
type Saved = { month: string; groups: TagMergeGroup[]; left: number | null };

// 태그 정리하기: AI proposes merges from tag names only; the person ticks
// which groups to apply. Opened from tag settings.
export default function TagCleanupScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [step, setStep] = useState<Step>('intro');
  const [groups, setGroups] = useState<TagMergeGroup[]>([]);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [left, setLeft] = useState<number | null>(null);
  const [changed, setChanged] = useState(0);
  const [error, setError] = useState('');

  // A suggestion bought earlier this month: straight to its list (nothing
  // ticked), without tags that have since gone.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const raw = await AsyncStorage.getItem(SAVED_KEY).catch(() => null);
      if (!raw) return;
      const saved = JSON.parse(raw) as Saved;
      if (saved.month !== thisMonth()) {
        AsyncStorage.removeItem(SAVED_KEY).catch(() => {});
        return;
      }
      const existing = new Set((await fetchTags().catch(() => null))?.tags ?? []);
      const still = saved.groups
        .map((g) => ({ ...g, merge: existing.size ? g.merge.filter((m) => existing.has(m)) : g.merge }))
        .filter((g) => g.merge.length > 0);
      if (cancelled || still.length === 0) return;
      setGroups(still);
      setPicked(new Set());
      setLeft(saved.left);
      setStep((cur) => (cur === 'intro' ? 'pick' : cur));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // This month's uses and AI consent, read on open and again on coming back
  // from the consent sheet, so the button says what a tap will do.
  const [plan, setPlan] = useState<Plan | null>(null);
  useEffect(() => {
    const refresh = () =>
      fetchPlan()
        .then(setPlan)
        .catch(() => {});
    refresh();
    return navigation.addListener('focus', refresh);
  }, [navigation]);
  const usesLeft = plan?.tag_cleanup ? Math.max(0, plan.tag_cleanup.limit - plan.tag_cleanup.used) : null;
  const noAiConsent = !!plan && plan.aiConsent !== 'agreed';

  const find = async () => {
    if (noAiConsent) {
      navigation.navigate('AiConsent');
      return;
    }
    if (usesLeft === 0) {
      navigation.replace('Paywall', { reason: 'tag_cleanup' });
      return;
    }
    setError('');
    setStep('finding');
    try {
      const res = await suggestTagCleanup();
      if (res.groups.length > 0) {
        AsyncStorage.setItem(SAVED_KEY, JSON.stringify({ month: thisMonth(), groups: res.groups, left: res.left } satisfies Saved)).catch(() => {});
      }
      setGroups(res.groups);
      // Nothing is merged unless the person ticks it.
      setPicked(new Set());
      setLeft(res.left);
      setStep('pick');
    } catch (err) {
      if (asQuotaError(err)) {
        navigation.replace('Paywall', { reason: 'tag_cleanup' });
        return;
      }
      // Not a failure: the consent sheet is opening.
      if (!(err instanceof ApiError && (err.body as { error?: string } | null)?.error === 'ai_consent')) setError(friendlyError(err));
      setStep('intro');
    }
  };

  const apply = async () => {
    const chosen = groups.filter((_, i) => picked.has(i));
    if (chosen.length === 0) return;
    setError('');
    setStep('applying');
    try {
      const res = await applyTagCleanup(chosen.map(({ keep, merge }) => ({ keep, merge })));
      // Home tabs follow the new names.
      const rename = new Map<string, string>();
      chosen.forEach((g) => g.merge.forEach((m) => rename.set(m, g.keep)));
      const tabs = await loadHomeTabs();
      const next = [...new Set(tabs.map((t) => rename.get(t) ?? t))];
      if (next.join('\n') !== tabs.join('\n')) await saveHomeTabs(next);
      setChanged(res.changed);
      AsyncStorage.removeItem(SAVED_KEY).catch(() => {});
      setStep('done');
    } catch (err) {
      setError(friendlyError(err));
      setStep('pick');
    }
  };

  const toggle = (i: number) =>
    setPicked((cur) => {
      const next = new Set(cur);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  // The server's counts (tagGroupCounts) when it sends them; older servers
  // only had per-tag counts, which overlap, so those are an upper bound.
  const sumOf = (g: TagMergeGroup, names: string[]) => names.reduce((n, t) => n + (g.counts[t] ?? 0), 0);
  const afterOf = (g: TagMergeGroup) => g.after ?? sumOf(g, [g.keep, ...g.merge]);
  const affected = groups.filter((_, i) => picked.has(i)).reduce((n, g) => n + (g.changes ?? sumOf(g, g.merge)), 0);
  const busy = step === 'finding' || step === 'applying';
  return (
    <ModalSheet theme={theme} onClose={busy ? () => {} : () => navigation.goBack()} paddingBottom={24} paddingHorizontal={20} maxHeightRatio={0.85}>
      <Heading theme={theme} size={20} style={styles.pad}>
        {S.title}
      </Heading>

      {step === 'intro' && (
        <>
          <Text style={[styles.line, { color: theme.ink }]}>{S.intro}</Text>
          <Text style={[styles.small, { color: theme.sub }]}>
            {S.cost}
            {noAiConsent ? S.consentNote : usesLeft !== null ? S.monthLeft(usesLeft) : ''}
          </Text>
        </>
      )}

      {step === 'finding' && (
        <View style={styles.wait}>
          <ActivityIndicator color={theme.accent} />
          <Text style={[styles.small, { color: theme.sub }]}>{S.finding}</Text>
        </View>
      )}

      {(step === 'pick' || step === 'applying') && (
        groups.length === 0 ? (
          <Text style={[styles.line, { color: theme.ink }]}>{S.none}</Text>
        ) : (
          <>
            <Text style={[styles.small, { color: theme.sub }]}>{S.pick}{left !== null ? ` · ${S.left(left)}` : ''}</Text>
            <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
              {groups.map((g, i) => {
                const on = picked.has(i);
                return (
                  <Pressable key={i} onPress={() => toggle(i)} disabled={busy} style={styles.group} accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
                    <View style={[styles.box, allEdges(OUTLINE, on ? theme.ink : theme.line), { borderRadius: theme.pickRadius, backgroundColor: on ? theme.ink : 'transparent' }]}>
                      {on && <CheckIcon size={10} color={theme.bg} strokeWidth={2.4} />}
                    </View>
                    <View style={styles.groupBody}>
                      {/* "드로잉 → 그림" reads as a merge; per-tag counts side by
                          side ("그림 (2) ← 드로잉 (2)") read as a rename. */}
                      <Text style={[styles.keep, { color: theme.ink }]}>
                        {g.merge.join(', ')} → {g.keep}
                      </Text>
                      <Text style={[styles.small, { color: theme.sub, marginTop: 2 }]}>{S.merged(afterOf(g))}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          </>
        )
      )}

      {step === 'done' && <Text style={[styles.line, { color: theme.ink }]}>{S.applied(changed)}</Text>}

      {error !== '' && <Text style={[styles.small, { color: theme.danger }]}>{error}</Text>}

      {/* Before merging, how big it is and that it sticks (decision T1). The
          per-tag counts can overlap (a memo with two merged tags), so it's an
          upper bound -- close enough to say what's about to change. */}
      {(step === 'pick' || step === 'applying') && picked.size > 0 && (
        <Text style={[styles.small, { color: theme.sub }]}>{S.willChange(affected)}</Text>
      )}

      <ButtonRow theme={theme} style={styles.buttons}>
        {step === 'intro' || step === 'finding' ? (
          <>
            <GhostButton label={S.cancel} theme={theme} onPress={() => navigation.goBack()} disabled={busy} />
            <SolidButton label={noAiConsent ? S.agreeAndStart : S.start} theme={theme} onPress={find} loading={step === 'finding'} />
          </>
        ) : step === 'done' || groups.length === 0 ? (
          <SolidButton label={S.done} theme={theme} onPress={() => navigation.goBack()} />
        ) : (
          <>
            <GhostButton label={S.cancel} theme={theme} onPress={() => navigation.goBack()} disabled={busy} />
            <SolidButton label={S.apply(picked.size)} theme={theme} onPress={apply} loading={step === 'applying'} disabled={picked.size === 0} />
          </>
        )}
      </ButtonRow>
    </ModalSheet>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: 4 },
  line: { fontSize: 14, lineHeight: 21, marginTop: 14, paddingHorizontal: 4, fontFamily: BODY_KR },
  small: { fontSize: 12.5, lineHeight: 18, marginTop: 10, paddingHorizontal: 4, fontFamily: BODY_KR },
  wait: { alignItems: 'center', gap: 4, marginTop: 24 },
  // Shrinks (and scrolls) on short phones so the merge button stays on screen.
  list: { marginTop: 8, maxHeight: 380, flexShrink: 1 },
  group: { flexDirection: 'row', gap: 12, paddingVertical: 10, paddingHorizontal: 4 },
  box: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  groupBody: { flex: 1 },
  keep: { fontSize: 14.5, fontFamily: BODY_KR_MEDIUM },
  buttons: { marginTop: 18 },
});
