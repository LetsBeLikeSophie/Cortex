import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useTheme } from '../theme/ThemeContext';
import { ModalSheet } from '../components/ModalSheet';
import { Heading } from '../components/Typography';
import { ButtonRow, GhostButton, SolidButton } from '../components/Buttons';
import { CheckIcon } from '../components/Icons';
import { allEdges, OUTLINE } from '../theme/themes';
import { applyTagCleanup, asQuotaError, friendlyError, suggestTagCleanup, TagMergeGroup } from '../api/client';
import { loadHomeTabs, saveHomeTabs } from '../data/tabs';
import { strings } from '../i18n';
import type { RootStackParamList } from '../navigation/types';

const S = strings({
  ko: {
    title: '태그 정리하기',
    intro: 'AI가 뜻이 같은 태그를 찾아 묶자고 제안해요. 태그 이름만 보내고, 고른 것만 합쳐요.',
    cost: '이번 달 1회 차감 · 제안이 없으면 차감하지 않아요',
    start: '정리 제안 받기',
    finding: '비슷한 태그를 찾고 있어요',
    none: '합칠 만한 태그가 없어요. 이미 깔끔해요.',
    pick: '합칠 묶음을 골라 주세요',
    apply: (n: number) => `${n}개 묶음 합치기`,
    applied: (n: number) => `메모 ${n}개의 태그를 정리했어요`,
    left: (n: number) => `이번 달 ${n}회 남음`,
    cancel: '취소',
    done: '확인',
  },
  en: {
    title: 'Tidy up tags',
    intro: 'AI suggests tags that mean the same thing. Only tag names are sent, and only the groups you pick are merged.',
    cost: "Uses 1 this month · not counted if there's nothing to suggest",
    start: 'Get suggestions',
    finding: 'Looking for look-alike tags',
    none: 'Nothing to merge. Your tags are already tidy.',
    pick: 'Pick the groups to merge',
    apply: (n: number) => `Merge ${n} ${n === 1 ? 'group' : 'groups'}`,
    applied: (n: number) => `Tidied the tags of ${n} ${n === 1 ? 'memo' : 'memos'}`,
    left: (n: number) => `${n} left this month`,
    cancel: 'Cancel',
    done: 'OK',
  },
  ja: {
    title: 'タグを整理',
    intro: '意味が同じタグをAIがまとめて提案します。送るのはタグ名だけで、選んだものだけを統合します。',
    cost: '今月1回分を使います · 提案がなければ数えません',
    start: '整理の提案をもらう',
    finding: '似たタグを探しています',
    none: '統合できるタグはありません。すでに整っています。',
    pick: '統合するグループを選んでください',
    apply: (n: number) => `${n}グループを統合`,
    applied: (n: number) => `メモ${n}件のタグを整理しました`,
    left: (n: number) => `今月あと${n}回`,
    cancel: 'キャンセル',
    done: 'OK',
  },
  'zh-Hans': {
    title: '整理标签',
    intro: 'AI 会找出意思相同的标签并建议合并。只发送标签名，只合并你选中的。',
    cost: '本月计 1 次 · 没有建议则不计',
    start: '获取整理建议',
    finding: '正在查找相似标签',
    none: '没有可合并的标签，已经很整齐了。',
    pick: '选择要合并的组',
    apply: (n: number) => `合并 ${n} 组`,
    applied: (n: number) => `已整理 ${n} 条笔记的标签`,
    left: (n: number) => `本月剩 ${n} 次`,
    cancel: '取消',
    done: '确定',
  },
  'zh-Hant': {
    title: '整理標籤',
    intro: 'AI 會找出意思相同的標籤並建議合併。只傳送標籤名稱，只合併你選取的。',
    cost: '本月計 1 次 · 沒有建議則不計',
    start: '取得整理建議',
    finding: '正在尋找相似標籤',
    none: '沒有可合併的標籤，已經很整齊了。',
    pick: '選擇要合併的組',
    apply: (n: number) => `合併 ${n} 組`,
    applied: (n: number) => `已整理 ${n} 則筆記的標籤`,
    left: (n: number) => `本月剩 ${n} 次`,
    cancel: '取消',
    done: '確定',
  },
});

type Step = 'intro' | 'finding' | 'pick' | 'applying' | 'done';

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

  const find = async () => {
    setError('');
    setStep('finding');
    try {
      const res = await suggestTagCleanup();
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
      setError(friendlyError(err));
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

  const busy = step === 'finding' || step === 'applying';
  return (
    <ModalSheet theme={theme} onClose={busy ? () => {} : () => navigation.goBack()} paddingBottom={24} paddingHorizontal={20} maxHeightRatio={0.85}>
      <Heading theme={theme} size={20} style={styles.pad}>
        {S.title}
      </Heading>

      {step === 'intro' && (
        <>
          <Text style={[styles.line, { color: theme.ink }]}>{S.intro}</Text>
          <Text style={[styles.small, { color: theme.sub }]}>{S.cost}</Text>
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
                      <Text style={[styles.keep, { color: theme.ink }]}>
                        {g.keep}
                        <Text style={{ color: theme.sub }}> ({g.counts[g.keep] ?? 0})</Text>
                      </Text>
                      <Text style={[styles.small, { color: theme.sub, marginTop: 2 }]}>
                        ← {g.merge.map((m) => `${m} (${g.counts[m] ?? 0})`).join(', ')}
                      </Text>
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

      <ButtonRow theme={theme} style={styles.buttons}>
        {step === 'intro' || step === 'finding' ? (
          <>
            <GhostButton label={S.cancel} theme={theme} onPress={() => navigation.goBack()} disabled={busy} />
            <SolidButton label={S.start} theme={theme} onPress={find} loading={step === 'finding'} />
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
  line: { fontSize: 14, lineHeight: 21, marginTop: 14, paddingHorizontal: 4, fontFamily: 'IBMPlexSansKR_400Regular' },
  small: { fontSize: 12.5, lineHeight: 18, marginTop: 10, paddingHorizontal: 4, fontFamily: 'IBMPlexSansKR_400Regular' },
  wait: { alignItems: 'center', gap: 4, marginTop: 24 },
  // Shrinks (and scrolls) on short phones so the merge button stays on screen.
  list: { marginTop: 8, maxHeight: 380, flexShrink: 1 },
  group: { flexDirection: 'row', gap: 12, paddingVertical: 10, paddingHorizontal: 4 },
  box: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  groupBody: { flex: 1 },
  keep: { fontSize: 14.5, fontFamily: 'IBMPlexSansKR_500Medium' },
  buttons: { marginTop: 18 },
});
