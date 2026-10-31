import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useTheme } from '../theme/ThemeContext';
import { ApiError, asQuotaError, composeMemo, fetchItemsWithTag, fetchPlan, friendlyError, Plan } from '../api/client';
import { showToast } from '../native/toast';
import { ModalSheet } from '../components/ModalSheet';
import { SheetTitle } from '../components/Typography';
import { composeMaterials } from '../api/format';
import { Bubble, isLowOnUses } from '../components/Bubble';
import { ButtonRow, GhostButton, SolidButton } from '../components/Buttons';
import { FieldRow, fieldTextStyle } from '../components/FieldRow';
import { VoiceInputButton } from '../components/VoiceInputButton';
import { OUTLINE, allEdges, BODY_KR, BODY_KR_MEDIUM } from '../theme/themes';
import { TagChip } from '../components/Chips';
import { SparkleIcon } from '../components/Icons';
import { loadHomeTabs, saveHomeTabs } from '../data/tabs';
import type { RootStackParamList } from '../navigation/types';
import { strings } from '../i18n';
import { COMMON, USES } from '../i18n/common';

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
    recentFifty: ' · 최근 50개만',
    composedOut: (n: number) => ` · 모아서 만든 메모 ${n}개는 빠져요`,
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
    askLabel: '정리 방식',
    requestLabel: '(선택) 더 바라는 점',
    autoShape: 'AI가 알아서',
    placeholder: '예: 20명 갈 수 있는 곳만, 가격순',
    working: '정리하는 중 · 창을 닫아도 계속 만들어요',
    remakeTitle: '다른 모양으로 다시 만들기',
    replaces: '지금 메모를 새 내용으로 바꿔요',
    editsToo: ' · 직접 고친 부분도 바뀌어요',
    doneToast: (tag: string) => `'${tag}' 모아서 만든 메모를 저장했어요`,
    failedToast: (tag: string) => `'${tag}' 모아서 만들기가 안 됐어요 · 횟수는 그대로예요`,
    quotaToast: '이번 달 모아서 만들기를 다 썼어요',
    slowToast: (tag: string) => `오래 걸려요 · 잠시 뒤 '${tag}' 탭을 확인해 주세요`,
    toPreview: '미리보기로',
    remakeFree: '다시 만들기 · 무료',
    remakePaid: '다시 만들기',
    makePro: 'Pro로 만들기',
    make: '만들기',
    agreeAndMake: '동의하고 만들기',
    consentNote: ' · AI 분석에 동의하면 만들 수 있어요',
  },
  en: {
    examples: ['Route', 'Comparison', 'Checklist', 'Schedule', 'Summary'],
    tooFew: 'You need at least 2 items',
    needTwo: (n: number) => `You need at least 2 items · now ${n}`,
    lockedOut: (n: number) => ` · ${n} locked memo${n === 1 ? '' : 's'} left out`,
    recentFifty: ' · newest 50 only',
    composedOut: (n: number) => ` · ${n} combined memo${n === 1 ? '' : 's'} left out`,
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
    askLabel: 'How to arrange it',
    requestLabel: '(optional) Anything else',
    autoShape: 'Let AI decide',
    placeholder: 'e.g. only places for 20, by price',
    working: 'Working · it keeps going if you close this',
    remakeTitle: 'Remake in another shape',
    replaces: 'Replaces this memo with the new one',
    editsToo: ' · your edits are replaced too',
    doneToast: (tag: string) => `Saved the combined '${tag}' memo`,
    failedToast: (tag: string) => `Couldn't combine '${tag}' · no use was spent`,
    quotaToast: "You've used this month's Combine",
    slowToast: (tag: string) => `Taking a while · check the '${tag}' tab in a bit`,
    toPreview: 'Back to preview',
    remakeFree: 'Remake · Free',
    remakePaid: 'Remake',
    makePro: 'Make with Pro',
    make: 'Make',
    agreeAndMake: 'Allow AI and make',
    consentNote: ' · Allow AI analysis to make it',
  },
  ja: {
    examples: ['コース・動線', '比較表', 'チェックリスト', 'スケジュール', '要約'],
    tooFew: 'メモが2つ以上必要です',
    needTwo: (n: number) => `メモが2つ以上必要です · 今は${n}件`,
    lockedOut: (n: number) => ` · ロック中のメモ${n}件は除きます`,
    recentFifty: ' · 最新の50件のみ',
    composedOut: (n: number) => ` · まとめメモ${n}件は除きます`,
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
    askLabel: 'まとめ方',
    requestLabel: '(任意) ほかの希望',
    autoShape: 'AIにおまかせ',
    placeholder: '例: 20人で行ける所だけ、価格順',
    working: '作成中 · 閉じても続きます',
    remakeTitle: '別の形で作り直す',
    replaces: '今のメモを新しい内容に置き換えます',
    editsToo: ' · 自分で直した部分も置き換わります',
    doneToast: (tag: string) => `「${tag}」のまとめメモを保存しました`,
    failedToast: (tag: string) => `「${tag}」のまとめを作れませんでした · 回数は減っていません`,
    quotaToast: '今月のまとめ作成を使い切りました',
    slowToast: (tag: string) => `時間がかかっています · 少ししてから「${tag}」タブを確認してください`,
    toPreview: 'プレビューへ',
    remakeFree: 'もう一度作る · 無料',
    remakePaid: 'もう一度作る',
    makePro: 'Proで作る',
    make: '作る',
    agreeAndMake: '同意して作る',
    consentNote: ' · AI分析に同意すると作れます',
  },
  'zh-Hans': {
    examples: ['路线', '对比表', '清单', '日程表', '摘要'],
    tooFew: '至少需要 2 项收藏内容',
    needTwo: (n: number) => `至少需要 2 项收藏内容 · 目前 ${n} 项`,
    lockedOut: (n: number) => ` · 不含 ${n} 条已锁定的备注`,
    recentFifty: ' · 仅最近 50 项',
    composedOut: (n: number) => ` · 不含 ${n} 条汇总笔记`,
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
    askLabel: '整理方式',
    requestLabel: '（可选）其他要求',
    autoShape: '交给 AI',
    placeholder: '例：只要能容纳 20 人的地方，按价格排序',
    working: '生成中 · 关闭也会继续',
    remakeTitle: '换个形式重做',
    replaces: '会用新内容替换当前备注',
    editsToo: ' · 你修改过的部分也会被替换',
    doneToast: (tag: string) => `已保存「${tag}」汇总笔记`,
    failedToast: (tag: string) => `「${tag}」汇总没能生成 · 次数未扣除`,
    quotaToast: '本月的汇总生成次数已用完',
    slowToast: (tag: string) => `需要一些时间 · 稍后请查看「${tag}」标签`,
    toPreview: '回到预览',
    remakeFree: '重新生成 · 免费',
    remakePaid: '重新生成',
    makePro: '用 Pro 生成',
    make: '生成',
    agreeAndMake: '同意并生成',
    consentNote: ' · 同意 AI 分析后即可生成',
  },
  'zh-Hant': {
    examples: ['路線', '比較表', '清單', '行程表', '摘要'],
    tooFew: '至少需要 2 項收藏內容',
    needTwo: (n: number) => `至少需要 2 項收藏內容 · 目前 ${n} 項`,
    lockedOut: (n: number) => ` · 不含 ${n} 則已鎖定的備註`,
    recentFifty: ' · 僅最近 50 項',
    composedOut: (n: number) => ` · 不含 ${n} 則彙整筆記`,
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
    askLabel: '整理方式',
    requestLabel: '（選填）其他要求',
    autoShape: '交給 AI',
    placeholder: '例：只要能容納 20 人的地方，依價格排序',
    working: '產生中 · 關閉也會繼續',
    remakeTitle: '換個形式重做',
    replaces: '會用新內容取代目前的備註',
    editsToo: ' · 你修改過的部分也會被取代',
    doneToast: (tag: string) => `已儲存「${tag}」彙整筆記`,
    failedToast: (tag: string) => `「${tag}」彙整沒能產生 · 次數未扣除`,
    quotaToast: '本月的彙整產生次數已用完',
    slowToast: (tag: string) => `需要一些時間 · 稍後請查看「${tag}」標籤`,
    toPreview: '回到預覽',
    remakeFree: '重新產生 · 免費',
    remakePaid: '重新產生',
    makePro: '用 Pro 產生',
    make: '產生',
    agreeAndMake: '同意並產生',
    consentNote: ' · 同意 AI 分析後即可產生',
  },
});

export default function ComposeScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { tag, count, lockedOut, composedOut, itemIds, tagChoices, retryOf, freeRemake, remakeBefore } = useRoute<RouteProp<RootStackParamList, 'Compose'>>().params;
  const [pickedTag, setPickedTag] = useState(tagChoices?.[0] ?? tag);
  const [tagCount, setTagCount] = useState<number | null>(count ?? null);
  const [lockedCount, setLockedCount] = useState(lockedOut ?? 0);
  const [shape, setShape] = useState<string | null>(null);
  const [ask, setAsk] = useState('');
  // Dictation appends to what's typed rather than replacing it.
  const askBase = useRef('');
  const askFocused = useRef(false);
  const scrollRef = useRef<ScrollView>(null);
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
  // Again on coming back from the consent sheet, so the button follows.
  useEffect(() => {
    refreshPlan();
    return navigation.addListener('focus', refreshPlan);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // No AI consent: making would only be refused -- the button leads to the
  // consent sheet instead (rule 2026-10-26).
  const noAiConsent = !!plan && plan.aiConsent !== 'agreed';

  // A whole tag: count it the way the server will use it -- its newest 50,
  // minus locked and earlier composed memos. One past 50 is asked for only
  // to know whether older ones are left out (decision C3: say so).
  const [overFifty, setOverFifty] = useState(false);
  // Earlier 모아서 만들기 results under this tag, left out like locked ones.
  const [tagComposed, setTagComposed] = useState(0);
  useEffect(() => {
    if (itemIds || retryOf) return;
    if (pickedTag !== tag || count === undefined) {
      setTagCount(null);
      setLockedCount(0);
      setTagComposed(0);
    }
    let cancelled = false;
    fetchItemsWithTag(pickedTag, 51)
      .then((res) => {
        if (cancelled) return;
        const m = composeMaterials(res.items.slice(0, 50));
        setTagCount(m.usable.length);
        setLockedCount(m.locked);
        setTagComposed(m.composed);
        setOverFifty(res.items.length > 50);
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
  const tooFew = materials !== null && materials < 2;
  // Tag mode counts its own (the tab may have been changed here); a fixed
  // pick keeps what the caller counted.
  const composedShown = itemIds || retryOf ? composedOut : tagCount !== null ? tagComposed : pickedTag === tag ? composedOut : 0;

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
        composedFrom: { tag: pickedTag, count: res.sourceCount, freeRemake: res.freeRemake },
        remadeFrom: retryOf && remakeBefore ? { title: remakeBefore.title, rawText: remakeBefore.rawText } : undefined,
      });
    } catch (err) {
      if (!mounted.current) {
        // The sheet promised to keep going after closing -- so a failure
        // after that is said too. A timeout may still finish on the server.
        const timedOut = err instanceof Error && /abort/i.test(err.message);
        showToast(asQuotaError(err) ? S.quotaToast : timedOut ? S.slowToast(pickedTag) : S.failedToast(pickedTag));
        return;
      }
      if (asQuotaError(err)) {
        navigation.replace('Paywall', { reason: 'compose' });
        return;
      }
      const code = err instanceof ApiError ? (err.body as { error?: string } | null)?.error : undefined;
      if (code === 'too_few') {
        setError(S.tooFew);
      } else if (code === 'ai_consent') {
        // Not a failure: the consent sheet is opening.
        refreshPlan();
      } else if (err instanceof Error && /abort/i.test(err.message)) {
        // Timed out here, but the server likely still finishes (and counts
        // it): pressing 만들기 again would make a second memo. Same as after
        // closing -- a toast to check the tab later, and the sheet goes.
        showToast(S.slowToast(pickedTag));
        close();
        return;
      } else {
        setError(friendlyError(err));
      }
      setWorking(false);
    }
  };

  const busy = working;

  const description = [
    // A remake replaces this very memo -- say so, and that hand edits go too.
    retryOf ? S.replaces + (remakeBefore?.edited ? S.editsToo : '') + ' · ' : '',
    tooFew ? S.needTwo(materials) : materials !== null ? S.summarizeN(Math.min(materials, 50)) : S.summarize,
    lockedCount > 0 ? S.lockedOut(lockedCount) : '',
    overFifty ? S.recentFifty : '',
    composedShown ? S.composedOut(composedShown) : '',
    // Retrying: the first run already took this month's 1 -- say so, or the
    // drop in the count reads as the retry's cost.
    remakeFree ? S.retryFreeNote : '',
    noAiConsent ? S.consentNote : '',
  ].join('');

  // The field is at the bottom of what scrolls: once the keyboard has shrunk
  // the sheet, or typing has grown the field, keep it in view.
  const keepFieldInView = () => {
    if (askFocused.current) scrollRef.current?.scrollToEnd({ animated: true });
  };

  return (
    <ModalSheet theme={theme} onClose={close} paddingBottom={24} paddingHorizontal={20} maxHeightRatio={0.9} liftForKeyboard>
      <SheetTitle
        theme={theme}
        icon={<SparkleIcon color={theme.accent} size={18} />}
        title={retryOf ? S.remakeTitle : itemIds ? S.titlePicked(itemIds.length) : S.titleTag(pickedTag)}
        sub={description}
      />
      <ScrollView
        ref={scrollRef}
        style={styles.flexShrink}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        onLayout={keepFieldInView}
        onContentSizeChange={keepFieldInView}
      >
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
        <FieldRow
          theme={theme}
          style={styles.askField}
          mic={
            <VoiceInputButton
              theme={theme}
              size={16}
              onStart={() => {
                askBase.current = ask.trim() ? `${ask.trimEnd()} ` : '';
              }}
              onResult={(spoken) => setAsk((askBase.current + spoken).slice(0, 100))}
            />
          }
        >
          <TextInput
            value={ask}
            onChangeText={setAsk}
            onFocus={() => {
              askFocused.current = true;
            }}
            onBlur={() => {
              askFocused.current = false;
            }}
            editable={!busy}
            maxLength={100}
            multiline
            placeholder={S.placeholder}
            placeholderTextColor={theme.sub}
            style={[fieldTextStyle, { color: theme.ink, outlineWidth: 0 }]}
          />
        </FieldRow>
      </ScrollView>

      {working && <Text style={[styles.sub, { color: theme.sub }]}>{S.working}</Text>}
      {error !== '' && <Text style={[styles.error, { color: theme.danger }]}>{error}</Text>}

      {!noAiConsent && !remakeFree && isLowOnUses(left) && <Bubble theme={theme} label={USES.left(left)} tail="down" tailInset={40} style={styles.bubble} />}
      <ButtonRow theme={theme} style={styles.buttons}>
        <GhostButton label={COMMON.cancel} theme={theme} onPress={close} />
        <SolidButton
          label={noAiConsent ? S.agreeAndMake : retryOf ? (remakeFree ? S.remakeFree : S.remakePaid) : left === 0 ? S.makePro : S.make}
          theme={theme}
          onPress={noAiConsent ? () => navigation.navigate('AiConsent') : make}
          loading={working}
          disabled={tooFew}
        />
      </ButtonRow>
    </ModalSheet>
  );
}

const styles = StyleSheet.create({
  // Doesn't shrink: the keyboard taking the room squashed it flat.
  bubble: { alignSelf: 'flex-end', flexShrink: 0, marginTop: 12, marginBottom: -6 },
  flexShrink: { flexShrink: 1 },
  sub: { fontSize: 13, lineHeight: 19, marginTop: 10, paddingHorizontal: 4, fontFamily: BODY_KR },
  tagChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12, paddingHorizontal: 4 },
  dim: { opacity: 0.45 },
  askLabel: { fontSize: 14, marginTop: 18, paddingHorizontal: 4, fontFamily: BODY_KR_MEDIUM },
  radios: { gap: 2, marginTop: 8, paddingHorizontal: 4 },
  radioRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7 },
  radioRing: { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 9, height: 9, borderRadius: 4.5 },
  radioText: { fontSize: 14.5, fontFamily: BODY_KR },
  askField: { marginTop: 8 },
  previewLabel: { fontSize: 13, fontFamily: BODY_KR_MEDIUM },
  previewTitle: { marginTop: 12, paddingHorizontal: 4 },
  previewBodyBox: { marginTop: 10, paddingHorizontal: 4 },
  previewBody: { fontSize: 14.5, lineHeight: 23, fontFamily: BODY_KR },
  retryLink: { marginTop: 14, paddingHorizontal: 4 },
  link: { fontSize: 13.5, fontFamily: BODY_KR_MEDIUM, textDecorationLine: 'underline' },
  error: { fontSize: 12.5, marginTop: 12, paddingHorizontal: 4, fontFamily: BODY_KR },
  buttons: { marginTop: 18 },
});
