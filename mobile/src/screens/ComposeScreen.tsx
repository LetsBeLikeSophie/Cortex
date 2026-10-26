import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useTheme } from '../theme/ThemeContext';
import { ApiError, asQuotaError, composeMemo, fetchItemsWithTag, fetchPlan, friendlyError, Plan } from '../api/client';
import { showToast } from '../native/toast';
import { ModalSheet } from '../components/ModalSheet';
import { Heading } from '../components/Typography';
import { composeMaterials } from '../api/format';
import { ButtonRow, GhostButton, SolidButton } from '../components/Buttons';
import { fieldStyle } from '../components/Fields';
import { VoiceInputButton } from '../components/VoiceInputButton';
import { OUTLINE, allEdges } from '../theme/themes';
import { TagChip } from '../components/Chips';
import { SparkleIcon } from '../components/Icons';
import { loadHomeTabs, saveHomeTabs } from '../data/tabs';
import type { RootStackParamList } from '../navigation/types';
import { strings } from '../i18n';
import { COMMON } from '../i18n/common';

// "모아서 만들기": a tag's items (or the ones picked in the tag tab) become
// one memo. The AI picks the shape unless the person says what they want.
// Saved as soon as it's made (closing the sheet doesn't lose it); the memo
// can then be remade in another shape once for free.
const S = strings({
  ko: {
    examples: ['코스·동선', '비교표', '체크리스트', '일정표', '요약'],
    tooFew: '메모가 2개 이상 있어야 해요',
    needTwo: (n: number) => `메모가 2개 이상 있어야 해요 · 지금 ${n}개`,
    lockedOut: (n: number) => ` · 잠긴 메모 ${n}개는 빠져요`,
    expired: '시간이 지나 결과가 사라졌어요. 다시 만들어 주세요.',
    previewLabel: (n: number) => `미리보기 · 메모 ${n}개로 만들었어요`,
    retryFree: '다른 모양으로 다시 · 무료',
    retryPaid: (left: number | null) => `다른 모양으로 다시 · 1회${left !== null ? ` (${left}회 남음)` : ''}`,
    saveToKeep: '저장해야 남아요',
    discard: '버리기',
    titlePicked: (n: number) => `고른 ${n}개 모아서 만들기`,
    titleTag: (tag: string) => `'${tag}' 모아서 만들기`,
    summarizeN: (n: number) => `메모 ${n}개를 한 메모로 정리해요`,
    summarize: '메모를 한 메모로 정리해요',
    retryFreeNote: ' · 처음 만들 때 1회 썼고, 이번엔 무료',
    retryCost: (left: number) => ` · 1회 (${left}회 남음)`,
    monthLeft: (left: number) => ` · 이번 달 ${left}회 남음`,
    askLabel: '(선택) 정리 방식 · 안 고르면 AI가 알아서',
    requestLabel: '(선택) 더 바라는 점',
    autoShape: 'AI가 알아서',
    placeholder: '예: 20명 갈 수 있는 곳만, 가격순',
    working: '정리하는 중 · 창을 닫아도 계속 만들어요',
    remakeTitle: '다른 모양으로 다시 만들기',
    doneToast: (tag: string) => `'${tag}' 모아서 만든 메모를 저장했어요`,
    toPreview: '미리보기로',
    remakeFree: '다시 만들기 · 무료',
    remakePaid: '다시 만들기 · 1회',
    makePro: 'Pro로 만들기',
    make: '만들기 · 1회',
  },
  en: {
    examples: ['Route', 'Comparison', 'Checklist', 'Schedule', 'Summary'],
    tooFew: 'You need at least 2 items',
    needTwo: (n: number) => `You need at least 2 items · now ${n}`,
    lockedOut: (n: number) => ` · ${n} locked memo${n === 1 ? '' : 's'} left out`,
    expired: 'The result expired. Please make it again.',
    previewLabel: (n: number) => `Preview · made from ${n} items`,
    retryFree: 'Remake in another shape · Free',
    retryPaid: (left: number | null) => `Remake in another shape · 1 use${left !== null ? ` (${left} left)` : ''}`,
    saveToKeep: 'Save it to keep it',
    discard: 'Discard',
    titlePicked: (n: number) => `Combine ${n} picked items`,
    titleTag: (tag: string) => `Combine '${tag}'`,
    summarizeN: (n: number) => `Turns ${n} items into one memo`,
    summarize: 'Turns items into one memo',
    retryFreeNote: ' · The first run used 1, this one is free',
    retryCost: (left: number) => ` · 1 use (${left} left)`,
    monthLeft: (left: number) => ` · ${left} left this month`,
    askLabel: '(optional) How to arrange it · AI decides if you skip',
    requestLabel: '(optional) Anything else',
    autoShape: 'Let AI decide',
    placeholder: 'e.g. only places for 20, by price',
    working: 'Working · it keeps going if you close this',
    remakeTitle: 'Remake in another shape',
    doneToast: (tag: string) => `Saved the combined '${tag}' memo`,
    toPreview: 'Back to preview',
    remakeFree: 'Remake · Free',
    remakePaid: 'Remake · 1 use',
    makePro: 'Make with Pro',
    make: 'Make · 1 use',
  },
  ja: {
    examples: ['コース・動線', '比較表', 'チェックリスト', 'スケジュール', '要約'],
    tooFew: 'メモが2つ以上必要です',
    needTwo: (n: number) => `メモが2つ以上必要です · 今は${n}件`,
    lockedOut: (n: number) => ` · ロック中のメモ${n}件は除きます`,
    expired: '時間が経って結果が消えました。もう一度作ってください。',
    previewLabel: (n: number) => `プレビュー · メモ${n}件から作りました`,
    retryFree: '別の形で作り直す · 無料',
    retryPaid: (left: number | null) => `別の形で作り直す · 1回${left !== null ? `(残り${left}回)` : ''}`,
    saveToKeep: '保存すると残ります',
    discard: '破棄',
    titlePicked: (n: number) => `選んだ${n}件をまとめて作る`,
    titleTag: (tag: string) => `「${tag}」をまとめて作る`,
    summarizeN: (n: number) => `メモ${n}件を1つのメモにまとめます`,
    summarize: 'メモを1つのメモにまとめます',
    retryFreeNote: ' · 最初の作成で1回使ったので、今回は無料',
    retryCost: (left: number) => ` · 1回(残り${left}回)`,
    monthLeft: (left: number) => ` · 今月残り${left}回`,
    askLabel: '(任意) まとめ方 · 選ばなければAIにおまかせ',
    requestLabel: '(任意) ほかの希望',
    autoShape: 'AIにおまかせ',
    placeholder: '例: 20人で行ける所だけ、価格順',
    working: '作成中 · 閉じても続きます',
    remakeTitle: '別の形で作り直す',
    doneToast: (tag: string) => `「${tag}」のまとめメモを保存しました`,
    toPreview: 'プレビューへ',
    remakeFree: 'もう一度作る · 無料',
    remakePaid: 'もう一度作る · 1回',
    makePro: 'Proで作る',
    make: '作る · 1回',
  },
  'zh-Hans': {
    examples: ['路线', '对比表', '清单', '日程表', '摘要'],
    tooFew: '至少需要 2 项收藏内容',
    needTwo: (n: number) => `至少需要 2 项收藏内容 · 目前 ${n} 项`,
    lockedOut: (n: number) => ` · 不含 ${n} 条已锁定的备注`,
    expired: '时间太久，结果已失效。请重新生成。',
    previewLabel: (n: number) => `预览 · 由 ${n} 项收藏内容生成`,
    retryFree: '换个形式重做 · 免费',
    retryPaid: (left: number | null) => `换个形式重做 · 1 次${left !== null ? `（剩 ${left} 次）` : ''}`,
    saveToKeep: '保存后才会保留',
    discard: '丢弃',
    titlePicked: (n: number) => `汇总生成：所选 ${n} 项`,
    titleTag: (tag: string) => `汇总生成「${tag}」`,
    summarizeN: (n: number) => `把 ${n} 项内容整理成一条备注`,
    summarize: '把内容整理成一条备注',
    retryFreeNote: ' · 首次生成已用 1 次，这次免费',
    retryCost: (left: number) => ` · 1 次（剩 ${left} 次）`,
    monthLeft: (left: number) => ` · 本月剩 ${left} 次`,
    askLabel: '（可选）整理方式 · 不选由 AI 决定',
    requestLabel: '（可选）其他要求',
    autoShape: '交给 AI',
    placeholder: '例：只要能容纳 20 人的地方，按价格排序',
    working: '生成中 · 关闭也会继续',
    remakeTitle: '换个形式重做',
    doneToast: (tag: string) => `已保存「${tag}」汇总笔记`,
    toPreview: '回到预览',
    remakeFree: '重新生成 · 免费',
    remakePaid: '重新生成 · 1 次',
    makePro: '用 Pro 生成',
    make: '生成 · 1 次',
  },
  'zh-Hant': {
    examples: ['路線', '比較表', '清單', '行程表', '摘要'],
    tooFew: '至少需要 2 項收藏內容',
    needTwo: (n: number) => `至少需要 2 項收藏內容 · 目前 ${n} 項`,
    lockedOut: (n: number) => ` · 不含 ${n} 則已鎖定的備註`,
    expired: '時間太久，結果已失效。請重新產生。',
    previewLabel: (n: number) => `預覽 · 由 ${n} 項收藏內容產生`,
    retryFree: '換個形式重做 · 免費',
    retryPaid: (left: number | null) => `換個形式重做 · 1 次${left !== null ? `（剩 ${left} 次）` : ''}`,
    saveToKeep: '儲存後才會保留',
    discard: '捨棄',
    titlePicked: (n: number) => `彙整生成：所選 ${n} 項`,
    titleTag: (tag: string) => `彙整生成「${tag}」`,
    summarizeN: (n: number) => `把 ${n} 項內容整理成一則備註`,
    summarize: '把內容整理成一則備註',
    retryFreeNote: ' · 首次產生已用 1 次，這次免費',
    retryCost: (left: number) => ` · 1 次（剩 ${left} 次）`,
    monthLeft: (left: number) => ` · 本月剩 ${left} 次`,
    askLabel: '（選填）整理方式 · 不選由 AI 決定',
    requestLabel: '（選填）其他要求',
    autoShape: '交給 AI',
    placeholder: '例：只要能容納 20 人的地方，依價格排序',
    working: '產生中 · 關閉也會繼續',
    remakeTitle: '換個形式重做',
    doneToast: (tag: string) => `已儲存「${tag}」彙整筆記`,
    toPreview: '回到預覽',
    remakeFree: '重新產生 · 免費',
    remakePaid: '重新產生 · 1 次',
    makePro: '用 Pro 產生',
    make: '產生 · 1 次',
  },
});

export default function ComposeScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { tag, count, lockedOut, itemIds, tagChoices, retryOf, freeRemake } = useRoute<RouteProp<RootStackParamList, 'Compose'>>().params;
  const [pickedTag, setPickedTag] = useState(tagChoices?.[0] ?? tag);
  const [tagCount, setTagCount] = useState<number | null>(count ?? null);
  const [lockedCount, setLockedCount] = useState(lockedOut ?? 0);
  const [shape, setShape] = useState<string | null>(null);
  const [ask, setAsk] = useState('');
  // Dictation appends to what's typed rather than replacing it.
  const askBase = useRef('');
  const [plan, setPlan] = useState<Plan | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  // Closing the sheet mid-way doesn't cancel the server's work; when it
  // finishes after that, say so with a toast instead of navigating.
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    []
  );

  const refreshPlan = () =>
    fetchPlan()
      .then(setPlan)
      .catch(() => {});
  useEffect(() => {
    refreshPlan();
  }, []);

  // Opened from a detail or search (no count): ask how many the tag has.
  useEffect(() => {
    if (itemIds || retryOf || (count !== undefined && pickedTag === tag)) return;
    setTagCount(null);
    setLockedCount(0);
    let cancelled = false;
    fetchItemsWithTag(pickedTag, 50)
      .then((res) => {
        if (cancelled) return;
        // Counted the server's way: locked and earlier composed memos are out.
        const m = composeMaterials(res.items);
        setTagCount(m.usable.length);
        setLockedCount(m.locked);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [pickedTag, itemIds, count, tag, retryOf]);

  const close = () => navigation.goBack();
  const left = plan?.compose ? Math.max(0, plan.compose.limit - plan.compose.used) : null;
  const remakeFree = !!retryOf && !!freeRemake;
  const materials = itemIds && count === undefined ? itemIds.length : tagCount;
  // Fewer than 2 usable memos: the server would refuse, so don't offer it.
  const tooFew = !retryOf && materials !== null && materials < 2;

  const make = async () => {
    if (!remakeFree && left === 0) {
      navigation.replace('Paywall', { reason: 'compose' });
      return;
    }
    setError('');
    setWorking(true);
    // The memo lives under its tag -- make sure that tag is a home tab,
    // once there is a memo (a too_few refusal adds no tab).
    const keepTab = async () => {
      const tabs = await loadHomeTabs();
      if (!tabs.includes(pickedTag)) await saveHomeTabs([...tabs, pickedTag]);
    };
    try {
      const res = await composeMemo(pickedTag, 'auto', { itemIds, retryOf, instruction: [shape, ask.trim()].filter(Boolean).join(' · ') || undefined });
      await keepTab().catch(() => {});
      if (!mounted.current) {
        showToast(S.doneToast(pickedTag));
        return;
      }
      navigation.replace('ItemDetail', {
        item: res.item,
        composedFrom: { tag: pickedTag, count: res.sourceCount, left: left !== null ? Math.max(0, left - (remakeFree ? 0 : 1)) : undefined, freeRemake: res.freeRemake },
      });
    } catch (err) {
      if (!mounted.current) return;
      if (asQuotaError(err)) {
        navigation.replace('Paywall', { reason: 'compose' });
        return;
      }
      if (err instanceof ApiError && (err.body as { error?: string } | null)?.error === 'too_few') {
        setError(S.tooFew);
      } else {
        setError(friendlyError(err));
      }
      setWorking(false);
    }
  };

  const busy = working;

  return (
    <ModalSheet theme={theme} onClose={close} paddingBottom={24} paddingHorizontal={20} maxHeightRatio={0.9}>
      <View style={styles.titleRow}>
        <SparkleIcon color={theme.accent} size={18} strokeWidth={1.5} />
        <Heading theme={theme} size={22}>
          {retryOf ? S.remakeTitle : itemIds ? S.titlePicked(itemIds.length) : S.titleTag(pickedTag)}
        </Heading>
      </View>
      <ScrollView style={styles.flexShrink} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* Opened from a detail: which of the item's tags to gather. */}
        {!retryOf && tagChoices && tagChoices.length > 1 && (
          <View style={styles.tagChoices}>
            {tagChoices.map((t) => (
              <Pressable key={t} onPress={() => setPickedTag(t)} disabled={busy} accessibilityRole="radio" accessibilityState={{ selected: t === pickedTag }}>
                <View pointerEvents="none" style={t === pickedTag ? null : styles.dim}>
                  <TagChip label={t} theme={theme} />
                </View>
              </Pressable>
            ))}
          </View>
        )}
        <Text style={[styles.sub, { color: theme.sub }]}>
          {tooFew ? S.needTwo(materials) : materials !== null ? S.summarizeN(Math.min(materials, 50)) : S.summarize}
          {!retryOf && lockedCount > 0 ? S.lockedOut(lockedCount) : ''}
          {/* Retrying: the first run already took this month's 1 -- say
              so, or the drop in the count reads as the retry's cost. */}
          {retryOf ? (remakeFree ? S.retryFreeNote : left !== null ? S.retryCost(left) : '') : left !== null ? S.monthLeft(left) : ''}
        </Text>

        <Text style={[styles.askLabel, { color: theme.ink }]}>{S.askLabel}</Text>
        <View style={styles.radios} accessibilityRole="radiogroup">
          {[null, ...S.examples].map((ex) => {
            const active = shape === ex;
            return (
              <Pressable
                key={ex ?? 'auto'}
                onPress={() => setShape(ex)}
                disabled={busy}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                style={styles.radioRow}
                hitSlop={4}
              >
                <View style={[styles.radioRing, allEdges(OUTLINE, active ? theme.ink : theme.sub)]}>
                  {active && <View style={[styles.radioDot, { backgroundColor: theme.ink }]} />}
                </View>
                <Text style={[styles.radioText, { color: theme.ink }]}>{ex ?? S.autoShape}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={[styles.askLabel, { color: theme.ink }]}>{S.requestLabel}</Text>
        <View>
          <TextInput
            value={ask}
            onChangeText={setAsk}
            editable={!busy}
            maxLength={100}
            multiline
            placeholder={S.placeholder}
            placeholderTextColor={theme.sub}
            style={[styles.askInput, fieldStyle(theme), { color: theme.ink, outlineWidth: 0 }]}
          />
          <View style={styles.micInField}>
            <VoiceInputButton
              theme={theme}
              onStart={() => {
                askBase.current = ask.trim() ? `${ask.trimEnd()} ` : '';
              }}
              onResult={(spoken) => setAsk((askBase.current + spoken).slice(0, 100))}
            />
          </View>
        </View>
      </ScrollView>

      {working && <Text style={[styles.sub, { color: theme.sub }]}>{S.working}</Text>}
      {error !== '' && <Text style={[styles.error, { color: theme.danger }]}>{error}</Text>}

      <ButtonRow theme={theme} style={styles.buttons}>
        <GhostButton label={COMMON.cancel} theme={theme} onPress={close} />
        <SolidButton
          label={retryOf ? (remakeFree ? S.remakeFree : S.remakePaid) : left === 0 ? S.makePro : S.make}
          theme={theme}
          onPress={make}
          loading={working}
          disabled={tooFew}
        />
      </ButtonRow>
    </ModalSheet>
  );
}

const styles = StyleSheet.create({
  flexShrink: { flexShrink: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 },
  sub: { fontSize: 13, lineHeight: 19, marginTop: 10, paddingHorizontal: 4, fontFamily: 'IBMPlexSansKR_400Regular' },
  tagChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12, paddingHorizontal: 4 },
  dim: { opacity: 0.45 },
  askLabel: { fontSize: 14, marginTop: 18, paddingHorizontal: 4, fontFamily: 'IBMPlexSansKR_500Medium' },
  radios: { gap: 2, marginTop: 8, paddingHorizontal: 4 },
  radioRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7 },
  radioRing: { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 9, height: 9, borderRadius: 4.5 },
  radioText: { fontSize: 14.5, fontFamily: 'IBMPlexSansKR_400Regular' },
  micInField: { position: 'absolute', right: 4, bottom: 6 },
  askInput: { marginTop: 10, paddingHorizontal: 14, paddingRight: 44, paddingVertical: 11, minHeight: 48, fontSize: 14, fontFamily: 'IBMPlexSansKR_400Regular' },
  previewLabel: { fontSize: 13, fontFamily: 'IBMPlexSansKR_500Medium' },
  previewTitle: { marginTop: 12, paddingHorizontal: 4 },
  previewBodyBox: { marginTop: 10, paddingHorizontal: 4 },
  previewBody: { fontSize: 14.5, lineHeight: 23, fontFamily: 'IBMPlexSansKR_400Regular' },
  retryLink: { marginTop: 14, paddingHorizontal: 4 },
  link: { fontSize: 13.5, fontFamily: 'IBMPlexSansKR_500Medium', textDecorationLine: 'underline' },
  error: { fontSize: 12.5, marginTop: 12, paddingHorizontal: 4, fontFamily: 'IBMPlexSansKR_400Regular' },
  buttons: { marginTop: 18 },
});
