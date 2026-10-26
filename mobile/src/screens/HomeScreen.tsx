import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useShareIntent } from 'expo-share-intent';
import { PolicyNotice } from '../components/PolicyNotice';
import { parseMehhMarker } from '../native/mehh';
import { drainShareQueue, enqueueSharedImages, useShareQueue } from '../share/shareQueue';
import { splitLinkText } from '../data/linkText';

import { useTheme } from '../theme/ThemeContext';
import { MONO, OUTLINE, Theme, allEdges, conceptOf, emToTracking } from '../theme/themes';
import { copyFor } from '../data/content';
import { TagTab, loadHomeTabs } from '../data/tabs';
import { fetchItemsWithTag, fetchUnclassifiedItems, fetchRecentItems, fetchPlan, classifyBacklog, addTag, removeAiTag, removeTag, deleteItem, ApiItem, ComposeFormat, Plan, friendlyError } from '../api/client';
import { composeMaterials, toRecentItem, relativeTime } from '../api/format';
import { RecentRow } from '../components/ListItems';
import { LayeredBack, VintageWallpaper } from '../components/Decor';
import { AsyncStateView } from '../components/AsyncStateView';
import { TabChip, TabAddChip, PileTabChip } from '../components/Chips';
import { IconButton, SolidButton } from '../components/Buttons';
import { SparkleIcon, StatsIcon, ProfileIcon, TrashIcon } from '../components/Icons';
import { showToast } from '../native/toast';
import type { RootStackParamList } from '../navigation/types';
import { strings } from '../i18n';
import { COMMON, TIME } from '../i18n/common';

const S = strings({
  ko: {
    tagAdded: (n: number, tag: string) => `${n}개에 '${tag}'를 붙였어요`,
    tagRemoved: (n: number, tag: string) => `${n}개에서 '${tag}'를 뺐어요`,
    tagAbsent: (n: number) => `${n}개는 원래 없었어요`,
    failed: (n: number) => `실패 ${n}개`,
    movedToTrash: (n: number) => `${n}개를 휴지통으로 옮겼어요`,
    sortStarted: (n: number) => `${n}건 정리를 시작했어요 · '모두'에서 분석 중이에요`,
    sortLeft: (n: number) => `${n}건은 아직 기다려요`,
    quotaUsedUp: '이번 달 AI 정리를 다 썼어요',
    nothingToSort: '정리할 수 있는 항목이 없어요',
    trash: '휴지통',
    sharedSaving: (n: number) => `사진 ${n}장 저장 중`,
    sharedCopyFailed: '사진을 받지 못했어요',
    sharedWaitingConsent: (n: number) => `사진 ${n}장 · 눌러서 저장 방법 고르기`,
    stats: '통계',
    account: '내 계정',
    all: '모두',
    waitingCount: (n: number) => `${n}건 정리 대기`,
    refillsOn: (date: string) => `${date}에 다시 생겨요`,
    usesRest: (n: number, date: string) => `남은 ${n}건을 다 써요 · 이후 저장은 ${date}까지 대기`,
    recentFirst: (n: number, left: number) => `최근 것부터 ${n}건 · 이번 달 AI 정리 ${left}건 남음`,
    sortWithAi: (n: number) => `AI로 정리 (${n})`,
    sortWithPro: 'Pro로 정리',
    needConsent: 'AI 분석에 동의하면 정리돼요',
    allowAi: 'AI 분석 동의',
    selected: (n: number) => `${n}개 선택됨`,
    toTrash: '휴지통으로',
    select: '선택',
    composeSelected: '✦ 모아서 만들기',
    compose: '모아서 만들기',
    addTag: '태그 추가',
    removeTag: '태그 제거',
    tagToAdd: '추가할 태그',
    tagToRemove: '제거할 태그',
    apply: '적용',
    empty: '아직 저장된 기억이 없어요.',
    nextMonth: '다음 달 1일',
  },
  en: {
    tagAdded: (n: number, tag: string) => `Added '${tag}' to ${n}`,
    tagRemoved: (n: number, tag: string) => `Removed '${tag}' from ${n}`,
    tagAbsent: (n: number) => `${n} didn't have it`,
    failed: (n: number) => `${n} failed`,
    movedToTrash: (n: number) => `Moved ${n} to trash`,
    sortStarted: (n: number) => `Sorting ${n} · see 'All'`,
    sortLeft: (n: number) => `${n} still waiting`,
    quotaUsedUp: "This month's AI sorting is used up",
    nothingToSort: 'Nothing to sort',
    trash: 'Trash',
    sharedSaving: (n: number) => `Saving ${n} photo${n === 1 ? '' : 's'}`,
    sharedCopyFailed: "Couldn't receive the photos",
    sharedWaitingConsent: (n: number) => `${n} photo${n === 1 ? '' : 's'} · tap to choose how to save`,
    stats: 'Stats',
    account: 'My account',
    all: 'All',
    waitingCount: (n: number) => `${n} waiting to sort`,
    refillsOn: (date: string) => `Refills on ${date}`,
    usesRest: (n: number, date: string) => `Uses your last ${n} · new saves wait until ${date}`,
    recentFirst: (n: number, left: number) => `${n}, newest first · ${left} AI sorts left this month`,
    sortWithAi: (n: number) => `Sort with AI (${n})`,
    sortWithPro: 'Sort with Pro',
    needConsent: 'Sorted once you allow AI analysis',
    allowAi: 'Allow AI',
    selected: (n: number) => `${n} selected`,
    toTrash: 'Move to trash',
    select: 'Select',
    composeSelected: '✦ Combine',
    compose: 'Combine',
    addTag: 'Add tag',
    removeTag: 'Remove tag',
    tagToAdd: 'Tag to add',
    tagToRemove: 'Tag to remove',
    apply: 'Apply',
    empty: 'Nothing saved yet.',
    nextMonth: 'the 1st of next month',
  },
  ja: {
    tagAdded: (n: number, tag: string) => `${n}件に「${tag}」を付けました`,
    tagRemoved: (n: number, tag: string) => `${n}件から「${tag}」を外しました`,
    tagAbsent: (n: number) => `${n}件は元々ありませんでした`,
    failed: (n: number) => `失敗 ${n}件`,
    movedToTrash: (n: number) => `${n}件をゴミ箱に移しました`,
    sortStarted: (n: number) => `${n}件の整理を始めました · 「すべて」で分析中です`,
    sortLeft: (n: number) => `${n}件はまだ待機中です`,
    quotaUsedUp: '今月のAI整理を使い切りました',
    nothingToSort: '整理できる項目がありません',
    trash: 'ゴミ箱',
    sharedSaving: (n: number) => `写真${n}枚を保存中`,
    sharedCopyFailed: '写真を受け取れませんでした',
    sharedWaitingConsent: (n: number) => `写真${n}枚 · タップして保存方法を選ぶ`,
    stats: '統計',
    account: 'マイアカウント',
    all: 'すべて',
    waitingCount: (n: number) => `${n}件 整理待ち`,
    refillsOn: (date: string) => `${date}に回復します`,
    usesRest: (n: number, date: string) => `残り${n}件を使い切ります · 以降の保存は${date}まで待機`,
    recentFirst: (n: number, left: number) => `新しい順に${n}件 · 今月のAI整理 残り${left}件`,
    sortWithAi: (n: number) => `AIで整理 (${n})`,
    sortWithPro: 'Proで整理',
    needConsent: 'AI分析に同意すると整理されます',
    allowAi: 'AI分析に同意',
    selected: (n: number) => `${n}件選択中`,
    toTrash: 'ゴミ箱へ',
    select: '選択',
    composeSelected: '✦ まとめて作る',
    compose: 'まとめて作る',
    addTag: 'タグ追加',
    removeTag: 'タグ削除',
    tagToAdd: '追加するタグ',
    tagToRemove: '削除するタグ',
    apply: '適用',
    empty: 'まだ保存されたものがありません。',
    nextMonth: '来月1日',
  },
  'zh-Hans': {
    tagAdded: (n: number, tag: string) => `已给 ${n} 项加上「${tag}」`,
    tagRemoved: (n: number, tag: string) => `已从 ${n} 项移除「${tag}」`,
    tagAbsent: (n: number) => `${n} 项原本就没有`,
    failed: (n: number) => `失败 ${n} 项`,
    movedToTrash: (n: number) => `已将 ${n} 项移到回收站`,
    sortStarted: (n: number) => `开始整理 ${n} 项 · 在「全部」中分析`,
    sortLeft: (n: number) => `${n} 项仍在等待`,
    quotaUsedUp: '本月 AI 整理次数已用完',
    nothingToSort: '没有可整理的项目',
    trash: '回收站',
    sharedSaving: (n: number) => `正在保存 ${n} 张照片`,
    sharedCopyFailed: '没能接收照片',
    sharedWaitingConsent: (n: number) => `${n} 张照片 · 点按选择保存方式`,
    stats: '统计',
    account: '我的账户',
    all: '全部',
    waitingCount: (n: number) => `${n} 项待整理`,
    refillsOn: (date: string) => `${date}恢复`,
    usesRest: (n: number, date: string) => `将用完剩余 ${n} 次 · 之后的保存等到${date}`,
    recentFirst: (n: number, left: number) => `从最新开始 ${n} 项 · 本月 AI 整理剩 ${left} 次`,
    sortWithAi: (n: number) => `用 AI 整理 (${n})`,
    sortWithPro: '用 Pro 整理',
    needConsent: '同意 AI 分析后即可整理',
    allowAi: '同意 AI 分析',
    selected: (n: number) => `已选 ${n} 项`,
    toTrash: '移到回收站',
    select: '选择',
    composeSelected: '✦ 汇总生成',
    compose: '汇总生成',
    addTag: '添加标签',
    removeTag: '移除标签',
    tagToAdd: '要添加的标签',
    tagToRemove: '要移除的标签',
    apply: '应用',
    empty: '还没有保存任何内容。',
    nextMonth: '下月1日',
  },
  'zh-Hant': {
    tagAdded: (n: number, tag: string) => `已為 ${n} 項加上「${tag}」`,
    tagRemoved: (n: number, tag: string) => `已從 ${n} 項移除「${tag}」`,
    tagAbsent: (n: number) => `${n} 項原本就沒有`,
    failed: (n: number) => `失敗 ${n} 項`,
    movedToTrash: (n: number) => `已將 ${n} 項移到垃圾桶`,
    sortStarted: (n: number) => `開始整理 ${n} 項 · 在「全部」中分析`,
    sortLeft: (n: number) => `${n} 項仍在等待`,
    quotaUsedUp: '本月 AI 整理次數已用完',
    nothingToSort: '沒有可整理的項目',
    trash: '垃圾桶',
    sharedSaving: (n: number) => `正在儲存 ${n} 張照片`,
    sharedCopyFailed: '沒能接收照片',
    sharedWaitingConsent: (n: number) => `${n} 張照片 · 點按選擇儲存方式`,
    stats: '統計',
    account: '我的帳戶',
    all: '全部',
    waitingCount: (n: number) => `${n} 項待整理`,
    refillsOn: (date: string) => `${date}恢復`,
    usesRest: (n: number, date: string) => `將用完剩餘 ${n} 次 · 之後的儲存等到${date}`,
    recentFirst: (n: number, left: number) => `從最新開始 ${n} 項 · 本月 AI 整理剩 ${left} 次`,
    sortWithAi: (n: number) => `用 AI 整理 (${n})`,
    sortWithPro: '用 Pro 整理',
    needConsent: '同意 AI 分析後即可整理',
    allowAi: '同意 AI 分析',
    selected: (n: number) => `已選 ${n} 項`,
    toTrash: '移到垃圾桶',
    select: '選擇',
    composeSelected: '✦ 彙整生成',
    compose: '彙整生成',
    addTag: '新增標籤',
    removeTag: '移除標籤',
    tagToAdd: '要新增的標籤',
    tagToRemove: '要移除的標籤',
    apply: '套用',
    empty: '還沒有儲存任何內容。',
    nextMonth: '下月1日',
  },
});

// The hero stat box's own front-layer fill -- mirrors cardShellStyle in
// ListItems.tsx (line/bordered/card unchanged there, layered here reuses
// the same offset-back-View idea via heroBack in the JSX below, not a
// second branch of this function).
function heroShellStyle(theme: Theme): ViewStyle {
  switch (theme.list) {
    case 'line':
      return allEdges(0, 'transparent');
    case 'bordered':
      return {
        backgroundColor: theme.surface,
        ...allEdges(OUTLINE, theme.line),
        borderRadius: theme.cardRadius + 6,
        padding: 22,
        paddingTop: 24,
        paddingBottom: 20,
      };
    case 'layered':
      return {
        backgroundColor: theme.cardBg,
        borderRadius: theme.cardRadius + 6,
        padding: 22,
        paddingTop: 24,
        paddingBottom: 20,
        ...allEdges(0, 'transparent'),
        // Vintage: the index card's colored header band.
        ...(conceptOf(theme) === 'vintage' ? { borderTopWidth: 3, borderTopColor: theme.accent } : null),
      };
  }
}

export default function HomeScreen() {
  const { theme, layoutKey, paletteKey } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [customTabs, setCustomTabs] = useState<TagTab[]>([]);
  const [activeTag, setActiveTag] = useState<TagTab | null>(null);
  const [rawItems, setRawItems] = useState<ApiItem[]>([]);
  // The active tag tab's own items, fetched from the whole archive (the
  // recent list above only covers the newest 50). Null while loading or
  // when no tag tab is active.
  const [tagItems, setTagItems] = useState<{ tag: string; items: ApiItem[] } | null>(null);
  // The 미분류 tab's own list from the server (oldest first) -- the recent
  // 50 often held none of the items 'AI로 정리' actually works on.
  const [waitingItems, setWaitingItems] = useState<ApiItem[] | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [sorting, setSorting] = useState(false);
  const [total, setTotal] = useState(0);
  const [serverWeekCount, setServerWeekCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Only reachable while a tag tab is active -- "add/remove a keyword
  // across everything already grouped under this tag" is the thing that
  // was asked for, not a bulk edit across the entire unfiltered archive.
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkEditing, setBulkEditing] = useState<'add' | 'remove' | null>(null);
  const [bulkTagDraft, setBulkTagDraft] = useState('');
  const [bulkApplying, setBulkApplying] = useState(false);
  // True for any boxed-away-from-the-edge layout ('bordered', 'layered') -- drives outer padding/spacing choices that
  // apply the same way across all of them. The hero box's own
  // background/border/stack rendering is more specific, see heroShellStyle
  // below.
  const boxed = theme.list !== 'line';
  // Matches TabChip (Chips.tsx): border/layer render pill tabs, line and
  // vintage render underline tabs -- the tab row's own spacing follows that.
  const pillTabs = ['border', 'layer'].includes(conceptOf(theme));
  const txt = copyFor();

  // Never asked about sending content to the AI: ask once per app run.
  const askedConsent = useRef(false);
  useEffect(() => {
    if (plan && plan.aiConsent === null && !askedConsent.current) {
      askedConsent.current = true;
      navigation.navigate('AiConsent');
    }
  }, [plan, navigation]);

  const load = React.useCallback(() => {
    setLoading(true);
    // Quota + 미분류함 count ride along with every refresh; a failure here
    // just leaves the last known plan on screen.
    fetchPlan()
      .then(setPlan)
      .catch(() => {});
    fetchRecentItems()
      .then((res) => {
        setRawItems(res.items);
        setTotal(res.total);
        setServerWeekCount(res.weekCount ?? null);
        setError(null);
      })
      // Leave whatever was already on screen alone -- a transient failure
      // (the backend mid-restart, a slow request timing out) shouldn't
      // wipe real saved items out from under someone who's just browsing.
      .catch((err) => setError(friendlyError(err)))
      .finally(() => setLoading(false));
  }, []);

  // Refetch whenever Home regains focus (e.g. after saving a new item, or
  // coming back from the tab picker) rather than just once on mount.
  useFocusEffect(
    React.useCallback(() => {
      load();
      loadHomeTabs().then((tabs) => {
        setCustomTabs(tabs);
        // A tab the user just removed in the picker can't stay selected.
        setActiveTag((current) => (current && current !== UNCLASSIFIED && !tabs.includes(current) ? null : current));
      });
    }, [load])
  );

  // Classification now finishes after the save response, in the
  // background -- poll while anything here is still 'pending' so a "분석
  // 중" row picks up its real title/tags without needing to leave and come
  // back to Home. items.length already keeps AsyncStateView's loading
  // state from flickering (see its `loading && items.length === 0` guard
  // below), so reusing `load()` here is safe.
  const hasPending = rawItems.some((it) => it.classification_status === 'pending');
  useEffect(() => {
    if (!hasPending) return;
    const id = setInterval(load, 3000);
    return () => clearInterval(id);
  }, [hasPending, load]);

  // Android-only for now (expo-share-intent's disableIOS: true) -- someone
  // shared into Cortex from another app. Hand it to the save sheet
  // pre-filled instead of silently swallowing it or requiring it be typed
  // in again by hand.
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntent();
  // Shared photos still being saved in the background; the list refreshes
  // as they land.
  const shareQueue = useShareQueue();
  const lastPending = React.useRef(shareQueue.pending);
  useEffect(() => {
    if (shareQueue.pending < lastPending.current) load();
    lastPending.current = shareQueue.pending;
  }, [shareQueue.pending, load]);
  useEffect(() => {
    if (!hasShareIntent) return;
    // Several images at once (ACTION_SEND_MULTIPLE, e.g. Mehh's screenshot
    // cleanup) go to the sheet's bulk mode; one stays the single-image flow.
    // The native module already copied each one into our cache dir, so the
    // sender trashing its originals afterwards doesn't lose them.
    const files = shareIntent.files ?? [];
    const isImage = (f: (typeof files)[number]) => !!f.path && (f.mimeType ?? 'image/').startsWith('image/');
    const images = files.filter(isImage);
    // Mehh tags its screenshot shares with this marker (in EXTRA_TEXT, kept
    // by our expo-share-intent patch): it's a request for a "saved" callback,
    // never a memo. Text riding along with other apps' images stays ignored,
    // as before. Its ids line up with the shared files by position; if the
    // counts differ they can't be trusted, and the callback sends a count only.
    const mehh = images.length > 0 ? parseMehhMarker(shareIntent.text) : null;
    const mehhIds = mehh?.ids?.length === files.length ? mehh.ids.filter((_, i) => isImage(files[i])) : undefined;
    if (mehh) {
      // "Send and forget": copy into our own queue and save in the
      // background -- no sheet to wait on. Mehh is told "received" (and
      // anything is uploaded) only once AI analysis is agreed to; without
      // that, the consent sheet comes first.
      resetShareIntent();
      enqueueSharedImages(images.map((f) => f.path), mehhIds).then(async (count) => {
        if (count === 0) {
          showToast(S.sharedCopyFailed);
          return;
        }
        const { waitingConsent } = await drainShareQueue();
        if (waitingConsent) navigation.navigate('AiConsent');
      });
      return;
    }
    // A shared link's surrounding words ("가게 이름 + 링크") were dropped;
    // now they prefill the link's note.
    const linkNote = images.length === 0 && shareIntent.webUrl && shareIntent.text ? splitLinkText(shareIntent.text)?.note : undefined;
    navigation.navigate('SaveSheet', {
      sharedImageUri: images.length === 1 ? images[0].path : undefined,
      sharedImageUris: images.length > 1 ? images.map((f) => f.path) : undefined,
      sharedUrl: images.length > 0 ? undefined : shareIntent.webUrl ?? undefined,
      sharedText: images.length > 0 || shareIntent.webUrl ? undefined : shareIntent.text ?? undefined,
      sharedNote: linkNote || undefined,
    });
    resetShareIntent();
  }, [hasShareIntent, shareIntent, navigation, resetShareIntent]);

  // Switching tabs invalidates whatever was selected (it was a selection
  // within the old filtered list), and "모두" has no filtered group to bulk
  // -edit at all, so leaving a tag tab always drops out of select mode too.
  // Fetch the tag tab's items whenever it's opened or Home refreshes.
  const loadTag = React.useCallback((tag: string | null) => {
    if (tag === UNCLASSIFIED) {
      setTagItems(null);
      fetchUnclassifiedItems()
        .then((res) => setWaitingItems(res.items))
        .catch(() => {});
      return;
    }
    if (!tag) {
      setTagItems(null);
      return;
    }
    fetchItemsWithTag(tag)
      .then((res) => setTagItems({ tag, items: res.items }))
      .catch(() => {});
  }, []);
  useEffect(() => {
    loadTag(activeTag);
  }, [activeTag, rawItems, loadTag]);

  const changeTag = (tag: TagTab | null) => {
    setActiveTag(tag);
    setSelectMode(false);
    setSelectedIds(new Set());
    setBulkEditing(null);
    setBulkTagDraft('');
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const applyBulkTag = async () => {
    const tag = bulkTagDraft.trim();
    if (!tag || selectedIds.size === 0 || !bulkEditing) return;
    setBulkApplying(true);
    const ids = [...selectedIds];
    // Removing has to hit the list the tag is actually in: an AI tag lives
    // in `tags`, one the person added in `user_tags` (removeTag alone only
    // ever cleared user_tags, so AI tags silently stayed). Items without the
    // tag are skipped, not counted as done.
    const byId = new Map(listSource.map((it) => [it.id, it]));
    let done = 0;
    let failed = 0;
    let absent = 0;
    await Promise.all(
      ids.map(async (id) => {
        const item = byId.get(id);
        try {
          if (bulkEditing === 'add') {
            await addTag(id, tag);
            done++;
            return;
          }
          const inAi = !!item?.tags.includes(tag);
          const inUser = !!item?.user_tags.includes(tag);
          if (!inAi && !inUser) {
            absent++;
            return;
          }
          if (inAi) await removeAiTag(id, tag);
          if (inUser) await removeTag(id, tag);
          done++;
        } catch {
          failed++;
        }
      })
    );
    showToast(
      [
        bulkEditing === 'add' ? S.tagAdded(done, tag) : S.tagRemoved(done, tag),
        absent ? S.tagAbsent(absent) : null,
        failed ? S.failed(failed) : null,
      ]
        .filter(Boolean)
        .join(' · ')
    );
    setBulkApplying(false);
    setBulkEditing(null);
    setBulkTagDraft('');
    setSelectMode(false);
    setSelectedIds(new Set());
    load();
  };

  // 미분류 tab's one bulk action: unwanted screenshots go to the trash
  // together instead of one detail sheet at a time. Restorable from there.
  const trashSelected = async () => {
    if (selectedIds.size === 0) return;
    setBulkApplying(true);
    const ids = [...selectedIds];
    const moved: string[] = [];
    let failed = 0;
    await Promise.all(
      ids.map(async (id) => {
        try {
          await deleteItem(id);
          moved.push(id);
        } catch {
          failed++;
        }
      })
    );
    setWaitingItems((current) => current?.filter((it) => !moved.includes(it.id)) ?? null);
    showToast(
      [moved.length ? S.movedToTrash(moved.length) : null, failed ? S.failed(failed) : null]
        .filter(Boolean)
        .join(' · ')
    );
    setBulkApplying(false);
    setSelectMode(false);
    setSelectedIds(new Set());
    load();
  };

  const tagList =
    activeTag && activeTag !== UNCLASSIFIED
      ? tagItems?.tag === activeTag
        ? tagItems.items
        : rawItems.filter((it) => it.tags.includes(activeTag) || it.user_tags.includes(activeTag))
      : null;
  const listSource = tagList ?? rawItems;
  const filtered =
    activeTag === UNCLASSIFIED
      ? waitingItems ?? rawItems.filter((it) => it.classification_status === 'unclassified')
      : tagList ?? rawItems;
  const unclassifiedCount = plan?.unclassifiedCount ?? rawItems.filter((it) => it.classification_status === 'unclassified').length;
  const classifyLeft = plan ? Math.max(0, plan.classify.limit - plan.classify.used) : 0;
  // Never agreed (or declined): the 미분류 strip asks for consent instead of
  // offering a sort the server would refuse (and Pro would not fix).
  const noAiConsent = !!plan && plan.aiConsent !== 'agreed';

  // "AI로 정리" in the 미분류함 tab: classify as much of the backlog as this
  // month's quota covers; with nothing left, it's the upgrade prompt.
  const sortBacklog = async () => {
    if (classifyLeft === 0) {
      navigation.navigate('Paywall', { reason: 'classify' });
      return;
    }
    setSorting(true);
    try {
      // Say what happened: the started items leave this tab for '모두'
      // (분석 중 there), and how many still wait.
      const { started, left } = await classifyBacklog();
      showToast(
        started > 0
          ? [
              S.sortStarted(started),
              left > 0 ? S.sortLeft(left) : null,
              started >= classifyLeft ? S.quotaUsedUp : null,
            ]
              .filter(Boolean)
              .join(' · ')
          : S.nothingToSort
      );
    } catch (err) {
      showToast(friendlyError(err));
    } finally {
      setSorting(false);
      load();
    }
  };

  // The tab chip disappears at 0 -- don't leave its empty view selected.
  useEffect(() => {
    if (activeTag === UNCLASSIFIED && plan && plan.unclassifiedCount === 0) changeTag(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTag, plan]);
  const items = filtered.map(toRecentItem);
  // Counted the server's way, so "메모 N개" matches what gets made.
  const tabMaterials = composeMaterials(listSource);

  // Always off the unfiltered list -- the hero card describes the whole
  // archive, not whatever tag tab happens to be active.
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  // The server's count when it has one: rawItems is only the newest 50,
  // so counting them capped a busy week at 50.
  const weekCount = serverWeekCount ?? rawItems.filter((it) => new Date(it.shared_at).getTime() >= weekAgo).length;
  const lastSaved = rawItems[0] ? relativeTime(rawItems[0].shared_at) : null;

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: theme.bg }]} edges={['top']}>
      <VintageWallpaper theme={theme} />
      <View style={[styles.headPad, { paddingHorizontal: boxed ? 24 : 26, paddingTop: boxed ? 26 : 30 }]}>
        <View style={styles.brandRow}>
          <Text style={{ fontFamily: MONO, fontSize: 11, letterSpacing: emToTracking(0.26, 11), color: theme.accent }}>
            CORTEX
          </Text>
          <View style={styles.brandRowActions}>
            <IconButton theme={theme} onPress={() => navigation.navigate('Trash')} label={S.trash}>
              <TrashIcon size={14} color={theme.ink} strokeWidth={1.3} />
            </IconButton>
            <IconButton theme={theme} onPress={() => navigation.navigate('Stats')} label={S.stats}>
              <StatsIcon size={15} color={theme.ink} strokeWidth={1.4} />
            </IconButton>
            <IconButton theme={theme} onPress={() => navigation.navigate('Profile')} label={S.account}>
              <ProfileIcon size={15} color={theme.ink} strokeWidth={1.4} />
            </IconButton>
          </View>
        </View>
        <PolicyNotice theme={theme} />
        {shareQueue.pending > 0 &&
          (shareQueue.waitingConsent ? (
            <Pressable onPress={() => navigation.navigate('AiConsent')} hitSlop={6} style={styles.shareQueueRow}>
              <Text style={[styles.shareQueueText, { color: theme.accent }]}>{S.sharedWaitingConsent(shareQueue.pending)}</Text>
            </Pressable>
          ) : (
            <View style={styles.shareQueueRow}>
              {shareQueue.running && <ActivityIndicator color={theme.sub} size="small" />}
              <Text style={[styles.shareQueueText, { color: theme.sub }]}>{S.sharedSaving(shareQueue.pending)}</Text>
            </View>
          ))}

        {/* No shadow/elevation here -- 'card' (retired) paired elevation
            with overflow:hidden and that's what caused the Android "shadow
            rounded, content square" rendering bug. 'bordered' is a plain
            1px border; 'layered' is a second plain View behind this one,
            offset down-right (heroBack below), painted behind purely by
            JSX order -- neither needs elevation at all. heroWrap (not
            heroBox itself) carries position:'relative' so heroBack's
            absolute offset is measured against the front box's own size,
            not some further-out ancestor. */}
        {/* key remounts the whole hero section on layout/palette change,
            on top of the per-Text key above -- belt and suspenders against
            the same Android stale-native-view class of bug. */}
        <View key={`${layoutKey}-${paletteKey}`} style={[styles.heroWrap, { marginTop: boxed ? 20 : 22 }]}>
          {theme.list === 'layered' && (
            <LayeredBack theme={theme} radius={theme.cardRadius + 6} style={styles.heroBack} />
          )}
          <View style={[styles.heroBox, heroShellStyle(theme)]}>

            <Text
              style={{
                fontFamily: 'IBMPlexSansKR_400Regular',
                fontSize: 13.5,
                letterSpacing: emToTracking(0.01, 13.5),
                color: theme.sub,
              }}
            >
              {txt.heroLabel}
            </Text>

            <View style={styles.numRow}>
              {/* key forces a full remount (not just a style update) when the
                  font family/weight changes -- Android can otherwise leave a
                  custom-font Text blank after switching fontFamily on an
                  already-mounted node instead of repainting it. */}
              <Text
                key={theme.headFamily + theme.headWeight}
                style={{
                  fontFamily: theme.headFamily,
                  fontWeight: theme.headWeight,
                  fontSize: theme.numSize,
                  lineHeight: theme.numSize * 0.86,
                  letterSpacing: emToTracking(theme.numTrackEm, theme.numSize),
                  color: theme.ink,
                }}
              >
                {total}
              </Text>
              <Text style={[styles.numSuffix, { color: theme.sub }]}>{txt.heroSuffix}</Text>
            </View>

            <View style={styles.heroFoot}>
              <View style={[styles.heroDot, { backgroundColor: theme.accent }]} />
              <Text
                style={{
                  fontFamily: 'IBMPlexSansKR_400Regular',
                  fontSize: 12.5,
                  letterSpacing: emToTracking(0.01, 12.5),
                  color: theme.accent,
                }}
              >
                {txt.heroFoot(weekCount, lastSaved)}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* Horizontal instead of wrapping -- a wrapping row pushes the "+" add
          chip to a second line once tags fill the first one, same reasoning
          as ItemDetailScreen's tag row. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[
          styles.tabsScroll,
          {
            paddingTop: pillTabs ? 20 : 28,
            paddingBottom: pillTabs ? 12 : 0,
            borderBottomWidth: pillTabs ? 0 : 1,
            borderBottomColor: theme.line,
          },
        ]}
        contentContainerStyle={[
          styles.tabs,
          {
            // Underline tabs top-align their label (padding only sits below
            // it, for the active-state border); centering the add chip's
            // fixed height against that box would land it a few px below
            // the label. Pill tabs are symmetric top/bottom, so centering
            // there is correct as-is.
            alignItems: pillTabs ? 'center' : 'flex-start',
            gap: pillTabs ? 8 : 18,
            paddingHorizontal: boxed ? 24 : 26,
          },
        ]}
      >
        <TabChip label={S.all} active={activeTag === null} theme={theme} onPress={() => changeTag(null)} />
        {/* Fixed, not removable: the pile of saves the month's AI quota
            didn't cover. Its growing count is the point -- see Paywall. */}
        {unclassifiedCount > 0 && (
          <PileTabChip count={unclassifiedCount} active={activeTag === UNCLASSIFIED} theme={theme} onPress={() => changeTag(UNCLASSIFIED)} />
        )}
        {customTabs.map((tag) => (
          <TabChip key={tag} label={tag} active={activeTag === tag} theme={theme} onPress={() => changeTag(tag)} />
        ))}
        <TabAddChip theme={theme} onPress={() => navigation.navigate('TabPicker')} />
      </ScrollView>

      {activeTag === UNCLASSIFIED && (
        // One compact strip, so the list underneath stays visible.
        <View style={[styles.backlog, { paddingHorizontal: boxed ? 24 : 26 }]}>
          <View style={styles.backlogText}>
            <Text style={[styles.backlogTitle, { color: theme.ink }]} numberOfLines={1}>
              {S.waitingCount(unclassifiedCount)}
            </Text>
            {/* When the press would spend the whole month's rest, say so --
                every save after it waits here until the reset. */}
            <Text style={[styles.backlogSub, { color: theme.sub }]} numberOfLines={2}>
              {/* No AI consent: neither quota nor Pro would sort these. */}
              {noAiConsent
                ? S.needConsent
                : classifyLeft === 0
                ? S.refillsOn(resetLabel(plan?.resetsAt))
                : classifyLeft <= unclassifiedCount
                  ? S.usesRest(classifyLeft, resetLabel(plan?.resetsAt))
                  : S.recentFirst(unclassifiedCount, classifyLeft)}
            </Text>
          </View>
          <SolidButton
            label={noAiConsent ? S.allowAi : classifyLeft > 0 ? S.sortWithAi(Math.min(classifyLeft, unclassifiedCount)) : S.sortWithPro}
            theme={theme}
            size="sm"
            flex={0}
            loading={sorting}
            onPress={noAiConsent ? () => navigation.navigate('AiConsent') : sortBacklog}
          />
        </View>
      )}

      {activeTag === UNCLASSIFIED && items.length > 0 && (
        <View style={[styles.bulkBar, { paddingHorizontal: boxed ? 24 : 26 }]}>
          <View style={styles.bulkBarRow}>
            {selectMode ? (
              <>
                <Text style={[styles.bulkBarText, { color: theme.sub }]}>{S.selected(selectedIds.size)}</Text>
                <View style={styles.bulkBarActions}>
                  {bulkApplying ? (
                    <ActivityIndicator color={theme.danger} size="small" />
                  ) : (
                    <Pressable onPress={trashSelected} disabled={selectedIds.size === 0}>
                      <Text style={[styles.bulkBarLink, { color: theme.danger, opacity: selectedIds.size ? 1 : 0.4 }]}>{S.toTrash}</Text>
                    </Pressable>
                  )}
                  <Pressable
                    onPress={() => {
                      setSelectMode(false);
                      setSelectedIds(new Set());
                    }}
                    disabled={bulkApplying}
                  >
                    <Text style={[styles.bulkBarLink, { color: theme.sub }]}>{COMMON.cancel}</Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <>
                <View />
                <Pressable onPress={() => setSelectMode(true)} hitSlop={6}>
                  <Text style={[styles.bulkBarLink, { color: theme.sub }]}>{S.select}</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      )}

      {activeTag && activeTag !== UNCLASSIFIED && items.length > 0 && (
        <View style={[styles.bulkBar, { paddingHorizontal: boxed ? 24 : 26 }]}>
          {selectMode ? (
            <>
              <View style={styles.bulkBarRow}>
                <Text style={[styles.bulkBarText, { color: theme.sub }]}>{S.selected(selectedIds.size)}</Text>
                <View style={styles.bulkBarActions}>
                  {/* Only the picked ones as materials (decision Q5). */}
                  {selectedIds.size >= 2 && (
                    <Pressable
                      onPress={() => {
                        const ids = [...selectedIds];
                        setSelectMode(false);
                        setSelectedIds(new Set());
                        const picked = composeMaterials(listSource.filter((it) => ids.includes(it.id)));
                        navigation.navigate('Compose', { tag: activeTag, count: picked.usable.length, lockedOut: picked.locked, itemIds: ids, suggested: suggestFormat(picked.usable) });
                      }}
                    >
                      <Text style={[styles.bulkBarLink, { color: theme.accent }]}>{S.composeSelected}</Text>
                    </Pressable>
                  )}
                  <Pressable onPress={() => setBulkEditing('add')} disabled={selectedIds.size === 0}>
                    <Text style={[styles.bulkBarLink, { color: theme.accent, opacity: selectedIds.size ? 1 : 0.4 }]}>
                      {S.addTag}
                    </Text>
                  </Pressable>
                  <Pressable onPress={() => setBulkEditing('remove')} disabled={selectedIds.size === 0}>
                    <Text style={[styles.bulkBarLink, { color: theme.accent, opacity: selectedIds.size ? 1 : 0.4 }]}>
                      {S.removeTag}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      setSelectMode(false);
                      setSelectedIds(new Set());
                      setBulkEditing(null);
                      setBulkTagDraft('');
                    }}
                  >
                    <Text style={[styles.bulkBarLink, { color: theme.sub }]}>{COMMON.cancel}</Text>
                  </Pressable>
                </View>
              </View>
              {bulkEditing && (
                <View style={[styles.bulkTagBox, { borderColor: theme.line }]}>
                  <TextInput
                    value={bulkTagDraft}
                    onChangeText={setBulkTagDraft}
                    autoFocus
                    editable={!bulkApplying}
                    placeholder={bulkEditing === 'add' ? S.tagToAdd : S.tagToRemove}
                    placeholderTextColor={theme.sub}
                    onSubmitEditing={applyBulkTag}
                    style={{ flex: 1, color: theme.ink, fontFamily: 'IBMPlexSansKR_400Regular', fontSize: 13.5, padding: 0, outlineWidth: 0 }}
                  />
                  {bulkApplying ? (
                    <ActivityIndicator color={theme.accent} size="small" />
                  ) : (
                    <Pressable onPress={applyBulkTag} disabled={!bulkTagDraft.trim()}>
                      <Text style={{ color: theme.accent, fontFamily: 'IBMPlexSansKR_500Medium', fontSize: 13.5 }}>
                        {S.apply}
                      </Text>
                    </Pressable>
                  )}
                </View>
              )}
            </>
          ) : (
            <View style={styles.bulkBarRow}>
              {/* "모아서 만들기": this tab's items -> one course/list/summary memo. */}
              {tabMaterials.usable.length >= 2 ? (
                <Pressable
                  onPress={() => navigation.navigate('Compose', { tag: activeTag, count: tabMaterials.usable.length, lockedOut: tabMaterials.locked, suggested: suggestFormat(tabMaterials.usable) })}
                  hitSlop={6}
                  style={styles.composeLink}
                >
                  <SparkleIcon color={theme.accent} size={13} strokeWidth={1.5} />
                  <Text style={[styles.bulkBarLink, { color: theme.accent }]}>{S.compose}</Text>
                </Pressable>
              ) : (
                <View />
              )}
              <Pressable onPress={() => setSelectMode(true)} hitSlop={6}>
                <Text style={[styles.bulkBarLink, { color: theme.sub }]}>{S.select}</Text>
              </Pressable>
            </View>
          )}
        </View>
      )}

      <AsyncStateView
        theme={theme}
        loading={loading && items.length === 0}
        error={items.length === 0 ? error : null}
        onRetry={load}
        empty={items.length === 0}
        emptyText={S.empty}
      >
        <FlatList
          // Android's default clips each row to its measured frame, which
          // can drop an outlined card's bottom edge on fractional heights.
          // These lists are short (≤50), so there's nothing to gain from it.
          removeClippedSubviews={false}
          data={items}
          keyExtractor={(item, i) => item.no + i}
          renderItem={({ item, index }) => {
            const rawId = filtered[index].id;
            return (
              <RecentRow
                item={item}
                theme={theme}
                selectMode={selectMode}
                selected={selectedIds.has(rawId)}
                onPress={() =>
                  selectMode ? toggleSelected(rawId) : navigation.navigate('ItemDetail', { item: filtered[index] })
                }
              />
            );
          }}
          contentContainerStyle={{ paddingHorizontal: boxed ? 24 : 26, paddingTop: boxed ? 12 : 0, paddingBottom: 24 }}
          style={styles.list}
        />
      </AsyncStateView>
    </SafeAreaView>
  );
}

// The compose format to suggest from what a tag mostly holds.
function suggestFormat(items: { category: string }[]): ComposeFormat {
  const counts = new Map<string, number>();
  for (const it of items) counts.set(it.category, (counts.get(it.category) ?? 0) + 1);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  return top === '가볼 곳' ? 'course' : top === '살 것' ? 'list' : 'summary';
}

// Tab key for the 미분류함 filter -- can't collide with a real tag (tags
// never start with "__").
const UNCLASSIFIED = '__unclassified__';

// "다음 달 1일" style label for when the monthly quota resets.
function resetLabel(iso?: string): string {
  if (!iso) return S.nextMonth;
  const d = new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000); // Korea time
  return TIME.monthDay(d.getUTCMonth() + 1, d.getUTCDate());
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  backlog: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 12, paddingBottom: 4 },
  backlogText: { flex: 1, minWidth: 0 },
  backlogTitle: { fontSize: 14, fontFamily: 'IBMPlexSansKR_500Medium' },
  backlogSub: { fontSize: 12, marginTop: 2, fontFamily: 'IBMPlexSansKR_400Regular' },
  headPad: {},
  shareQueueRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  shareQueueText: { fontFamily: 'IBMPlexSansKR_400Regular', fontSize: 12.5 },
  brandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brandRowActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heroWrap: { position: 'relative' },
  heroBack: { position: 'absolute', top: 6, left: 6, right: -6, bottom: -6 },
  heroBox: { position: 'relative', overflow: 'hidden' },
  heroDot: { width: 8, height: 8, borderRadius: 4 },
  numRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, marginTop: 10 },
  numSuffix: { fontSize: 14, lineHeight: 21, paddingBottom: 9, fontFamily: 'IBMPlexSansKR_400Regular' },
  heroFoot: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 18 },
  tabsScroll: { flexGrow: 0 },
  // Vertical breathing room: a horizontal ScrollView clips its content to
  // the content's own (often fractional) height on Android, which shaved
  // the bottom edge off outlined pill tabs.
  tabs: { flexDirection: 'row', paddingVertical: 2 },
  list: { flex: 1 },
  composeLink: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  bulkBar: { paddingTop: 12 },
  bulkBarRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', rowGap: 8 },
  bulkBarText: { fontSize: 12.5, fontFamily: 'IBMPlexSansKR_400Regular' },
  // Wraps to a second line when the actions don't fit (long languages, many selected).
  bulkBarActions: { flexDirection: 'row', flexShrink: 1, flexWrap: 'wrap', justifyContent: 'flex-end', columnGap: 14, rowGap: 6 },
  bulkBarLink: { fontSize: 12.5, fontFamily: 'IBMPlexSansKR_500Medium' },
  bulkTagBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 10,
  },
});
