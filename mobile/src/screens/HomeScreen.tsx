import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useShareIntent } from 'expo-share-intent';
import { PolicyNotice } from '../components/PolicyNotice';
import { parseMehhMarker } from '../native/mehh';
import { discardUnreceivedShares, drainShareQueue, enqueueSharedImages, getDeclinedChoice, saveSharesWithoutAi, takeUnreportedShares, useShareQueue } from '../share/shareQueue';
import { splitLinkText } from '../data/linkText';

import { useTheme } from '../theme/ThemeContext';
import { MONO, OUTLINE, Theme, allEdges, conceptOf, emToTracking, BODY_KR, BODY_KR_MEDIUM } from '../theme/themes';
import { copyFor } from '../data/content';
import { TagTab, loadHomeTabs } from '../data/tabs';
import { forgetWeekly, refillCount, syncReminders } from '../native/reminders';
import { useAuth } from '../auth/AuthContext';
import { IMPORT_OFFER_KEY, TRIAL_NOTICE_KEY } from '../auth/accountTraces';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchItem, fetchItemsWithTag, fetchTabUpTo, fetchUnclassifiedItems, fetchRecentItems, fetchRecentUpTo, fetchPlan, classifyBacklog, setTagLocked, isTagLockLimit, addTag, removeAiTag, removeTag, deleteItem, ApiItem, ComposeFormat, Plan, friendlyError, isAlreadyRunning, isTimeout, usesLeft } from '../api/client';
import { composeMaterials, toRecentItem, relativeTime } from '../api/format';
import { RecentRow } from '../components/ListItems';
import { ProgressRow } from '../components/ProgressRow';
import { appendPage, mergeFirstPage, replaceNewest, updateRows } from '../api/itemPages';
import { useRunningComposes } from '../compose/running';
import { LayeredBack, VintageWallpaper } from '../components/Decor';
import { AsyncStateView } from '../components/AsyncStateView';
import { TabChip, TabAddChip, PileTabChip } from '../components/Chips';
import { Bubble, isLowOnUses } from '../components/Bubble';
import { GhostButton, IconButton, SolidButton } from '../components/Buttons';
import { ConfirmPopup } from '../components/ConfirmPopup';
import { LockIcon, SparkleIcon, StatsIcon, ProfileIcon, TrashIcon } from '../components/Icons';
import { askPin, hasPin } from '../lock/memoLock';
import { closeTags, hiddenByTagLock, openTags, refreshLockedTags, setLockedTags, useTagLock } from '../lock/tagLock';
import { showToast } from '../native/toast';
import type { RootStackParamList } from '../navigation/types';
import { COMMON, TIME, USES } from '../i18n/common';
import { S } from './HomeScreen.strings';

const DAY_MS = 24 * 60 * 60 * 1000;

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

const FIRST_PAGE = 100;
const SLOW_POLL_MS = 30_000;
const FAR_ROWS_PER_POLL = 10;

export default function HomeScreen() {
  const { theme, layoutKey, paletteKey } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [customTabs, setCustomTabs] = useState<TagTab[]>([]);
  const [activeTag, setActiveTag] = useState<TagTab | null>(null);
  const tagLock = useTagLock();
  const [rawItems, setRawItems] = useState<ApiItem[]>([]);
  // The active tag tab's own items, fetched from the whole archive (the
  // recent list above only covers the newest 50). Null while loading or
  // when no tag tab is active.
  const [tagItems, setTagItems] = useState<{ tag: string; items: ApiItem[] } | null>(null);
  // The 미분류 tab's own list from the server (oldest first) -- the recent
  // 50 often held none of the items 'AI로 정리' actually works on.
  const [waitingItems, setWaitingItems] = useState<ApiItem[] | null>(null);
  // Goes up with each full refresh of the list, which the open tab follows.
  const [listVersion, setListVersion] = useState(0);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [askSort, setAskSort] = useState(false);
  const [sorting, setSorting] = useState(false);
  // A run that outlasted the wait (or one already going) keeps going on the
  // server; the button stays off so it isn't sent twice.
  const [sortHeld, setSortHeld] = useState(false);
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

  // Said once: the last day of the trial, or the next open after it ended.
  // A guest's trial is over from the start, so a guest never gets this.
  const { session } = useAuth();
  const showTrialNotice = (p: Plan) => {
    if (session?.user.is_anonymous) return;
    const left = Date.parse(p.trialEndsAt) - Date.now();
    const reason = p.tier === 'trial' && left <= DAY_MS ? 'trial_ending' : p.tier === 'free' && left <= 0 && left > -30 * DAY_MS ? 'trial_ended' : null;
    if (!reason) return;
    AsyncStorage.getItem(TRIAL_NOTICE_KEY)
      .then((seen) => {
        if (seen || !navigation.isFocused()) return;
        AsyncStorage.setItem(TRIAL_NOTICE_KEY, '1').catch(() => {});
        navigation.navigate('Paywall', { reason });
      })
      .catch(() => {});
  };

  // An account's first home offers, once, to bring in screenshots already
  // piling up on the phone (decision P2) -- finding those is what the trial
  // is for. Guests aren't offered it. Gone after either button.
  const importKey = session && !session.user.is_anonymous ? `${IMPORT_OFFER_KEY}.${session.user.id}` : null;
  const [offerImport, setOfferImport] = useState(false);
  useEffect(() => {
    if (!importKey) return;
    AsyncStorage.getItem(importKey)
      .then((seen) => setOfferImport(!seen))
      .catch(() => {});
  }, [importKey]);
  const closeImportOffer = (pick: boolean) => {
    setOfferImport(false);
    if (importKey) AsyncStorage.setItem(importKey, '1').catch(() => {});
    if (pick) navigation.navigate('SaveSheet', { pickPhotos: true });
  };

  // The rows paged in so far, so a refresh brings back as many.
  const loadedCount = React.useRef(0);
  loadedCount.current = rawItems.length;
  const itemsNow = React.useRef(rawItems);
  itemsNow.current = rawItems;
  const reachedEnd = React.useRef(false);
  // The open tab's lists, for its refresh and its next page. A tab reached its
  // end when a next page added nothing.
  const activeTagNow = React.useRef(activeTag);
  activeTagNow.current = activeTag;
  const tagItemsNow = React.useRef(tagItems);
  tagItemsNow.current = tagItems;
  const waitingNow = React.useRef(waitingItems);
  waitingNow.current = waitingItems;
  const tabEnded = React.useRef<string | null>(null);
  // While memos are being sorted: only the open tab's newest rows.
  const refreshTabTop = React.useCallback(() => {
    const tab = activeTagNow.current;
    if (tab === UNCLASSIFIED) {
      fetchUnclassifiedItems(FIRST_PAGE)
        .then((res) => setWaitingItems((current) => replaceNewest(current ?? [], res.items, FIRST_PAGE)))
        .catch(() => {});
    } else if (tab) {
      fetchItemsWithTag(tab, FIRST_PAGE)
        .then((res) => setTagItems((current) => (current?.tag === tab ? { tag: tab, items: replaceNewest(current.items, res.items, FIRST_PAGE) } : current)))
        .catch(() => {});
    }
  }, []);
  // Quota + 미분류함 count ride along with every refresh; a failure here
  // just leaves the last known plan on screen.
  const refreshPlan = React.useCallback(() => {
    fetchPlan()
      .then((p) => {
        setPlan(p);
        syncReminders(refillCount(p)).catch(() => {});
        showTrialNotice(p);
      })
      .catch(() => {});
  }, []);
  const load = React.useCallback(() => {
    setLoading(true);
    refreshPlan();
    fetchRecentUpTo(loadedCount.current)
      .then((res) => {
        reachedEnd.current = false;
        setRawItems(res.items);
        setListVersion((v) => v + 1);
        setTotal(res.total);
        setServerWeekCount(res.weekCount ?? null);
        setError(null);
      })
      // Leave whatever was already on screen alone -- a transient failure
      // (the backend mid-restart, a slow request timing out) shouldn't
      // wipe real saved items out from under someone who's just browsing.
      .catch((err) => setError(friendlyError(err)))
      .finally(() => setLoading(false));
  }, [refreshPlan]);

  // Refetch whenever Home regains focus (e.g. after saving a new item, or
  // coming back from the tab picker) rather than just once on mount.
  useFocusEffect(
    React.useCallback(() => {
      load();
      refreshLockedTags();
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
  // back to Home.
  const pendingCount = rawItems.filter((it) => it.classification_status === 'pending').length;
  const hasPending = pendingCount > 0;
  // A minute in, say that it's slow, not stuck.
  const [sortingSlow, setSortingSlow] = useState(false);
  useEffect(() => {
    setSortingSlow(false);
    if (!hasPending) return;
    const id = setTimeout(() => setSortingSlow(true), 60_000);
    return () => clearTimeout(id);
  }, [hasPending]);
  // A memo that was being sorted and ended up in 미분류함 says so once, on
  // Home. A later visit still reports one that failed while elsewhere.
  const watchedPending = React.useRef(new Set<string>());
  useEffect(() => {
    if (!navigation.isFocused()) return;
    const failed = rawItems.filter((it) => watchedPending.current.has(it.id) && it.classification_status === 'unclassified' && it.unclassified_reason !== 'consent').length;
    watchedPending.current = new Set(rawItems.filter((it) => it.classification_status === 'pending').map((it) => it.id));
    if (failed > 0) showToast(S.sortFailed(failed));
  }, [rawItems, navigation]);
  // Only on Home, one request at a time, and only the newest rows, however far
  // someone has scrolled: a pending row further down is looked up on its own.
  useFocusEffect(
    React.useCallback(() => {
      if (!hasPending) return;
      const started = Date.now();
      let lastFar = started;
      let lastPlan = started;
      let stopped = false;
      let timer: ReturnType<typeof setTimeout>;
      const poll = async () => {
        const inFirstPage = itemsNow.current.slice(0, FIRST_PAGE).filter((it) => it.classification_status === 'pending');
        if (inFirstPage.length > 0) {
          const first = await fetchRecentItems(FIRST_PAGE);
          if (stopped) return;
          if (mergeFirstPage(itemsNow.current, first.items) !== itemsNow.current) refreshTabTop();
          setRawItems((current) => mergeFirstPage(current, first.items));
          setTotal(first.total);
          setServerWeekCount(first.weekCount ?? null);
        }
        if (Date.now() - lastFar >= SLOW_POLL_MS) {
          lastFar = Date.now();
          const far = itemsNow.current.slice(FIRST_PAGE).filter((it) => it.classification_status === 'pending').slice(0, FAR_ROWS_PER_POLL);
          const rows = await Promise.allSettled(far.map((it) => fetchItem(it.id)));
          if (stopped) return;
          const found = rows.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
          if (found.length > 0) setRawItems((current) => updateRows(current, found));
        }
        if (Date.now() - lastPlan >= SLOW_POLL_MS) {
          lastPlan = Date.now();
          refreshPlan();
        }
      };
      const next = () => {
        if (stopped) return;
        timer = setTimeout(() => {
          poll().catch(() => {}).finally(next);
        }, Date.now() - started >= 60_000 ? 10_000 : 3_000);
      };
      next();
      return () => {
        stopped = true;
        clearTimeout(timer);
      };
    }, [hasPending, refreshPlan, refreshTabTop])
  );
  // All sorted: the uses left and the 미분류함 count are current again.
  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !hasPending) refreshPlan();
    wasPending.current = hasPending;
  }, [hasPending, refreshPlan]);

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
  // 모아서 만들기 going on after its sheet closed; its memo shows when done.
  const composing = useRunningComposes();
  const lastComposing = React.useRef(composing.length);
  useEffect(() => {
    if (composing.length < lastComposing.current) {
      load();
      loadHomeTabs().then(setCustomTabs);
    }
    lastComposing.current = composing.length;
  }, [composing.length, load]);
  // Once the queue is idle (and whenever the app comes back), say once if
  // shared photos landed in 미분류함 because the month's AI sorting ran out
  // -- including ones saved in the background meanwhile.
  const announceShares = React.useCallback(() => {
    takeUnreportedShares()
      .then(({ saved, quota, failed }) => {
        const lines = [quota > 0 ? S.mehhQuota(saved, quota) : null, failed ? S.mehhFailed(failed) : null].filter(Boolean);
        if (lines.length) showToast(lines.join(' · '));
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (!shareQueue.running) announceShares();
  }, [shareQueue.running, shareQueue.pending, announceShares]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') announceShares();
    });
    return () => sub.remove();
  }, [announceShares]);
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
        if (!waitingConsent) return;
        // AI already declined and an answer remembered (decision M2): follow
        // it without asking. Otherwise the consent sheet comes first.
        const [choice, consent] = await Promise.all([getDeclinedChoice(), fetchPlan().then((p) => p.aiConsent ?? null).catch(() => undefined)]);
        if (consent === 'declined' && choice === 'keep') {
          showToast(S.sharedKept(count));
          saveSharesWithoutAi();
        } else if (consent === 'declined' && choice === 'drop') {
          const dropped = await discardUnreceivedShares();
          if (dropped > 0) showToast(S.sharedNotKept(dropped));
        } else {
          navigation.navigate('AiConsent');
        }
      });
      return;
    }
    // A shared link's surrounding words ("가게 이름 + 링크") were dropped;
    // now they prefill the link's note.
    const linkNote = images.length === 0 && shareIntent.webUrl && shareIntent.text ? splitLinkText(shareIntent.text)?.note : undefined;
    navigation.navigate('SaveSheet', {
      shareId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
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
    tabEnded.current = null;
    if (tag === UNCLASSIFIED) {
      setTagItems(null);
      fetchTabUpTo((before) => fetchUnclassifiedItems(FIRST_PAGE, before), waitingNow.current?.length ?? 0)
        .then(setWaitingItems)
        .catch(() => {});
      return;
    }
    if (!tag) {
      setTagItems(null);
      return;
    }
    const shown = tagItemsNow.current?.tag === tag ? tagItemsNow.current.items.length : 0;
    fetchTabUpTo((before) => fetchItemsWithTag(tag, FIRST_PAGE, before), shown)
      .then((items) => setTagItems({ tag, items }))
      .catch(() => {});
  }, []);
  useEffect(() => {
    loadTag(activeTag);
  }, [activeTag, listVersion, loadTag]);

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
    if (moved.length) forgetWeekly().catch(() => {});
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
  const [loadingMore, setLoadingMore] = useState(false);
  // A tag tab or 미분류함, a page at a time like '모두'.
  const loadMoreOfTab = (tab: string) => {
    const current = tab === UNCLASSIFIED ? waitingItems : tagItems?.tag === tab ? tagItems.items : null;
    if (!current || current.length < FIRST_PAGE || tabEnded.current === tab) return;
    const before = current[current.length - 1].shared_at;
    setLoadingMore(true);
    (tab === UNCLASSIFIED ? fetchUnclassifiedItems(FIRST_PAGE, before) : fetchItemsWithTag(tab, FIRST_PAGE, before))
      .then((res) => {
        if (appendPage(current, res.items).length === current.length) tabEnded.current = tab;
        if (tab === UNCLASSIFIED) setWaitingItems((list) => appendPage(list ?? [], res.items));
        else setTagItems((list) => (list?.tag === tab ? { tag: tab, items: appendPage(list.items, res.items) } : list));
      })
      .catch(() => {})
      .finally(() => setLoadingMore(false));
  };
  // '모두' goes back through the whole archive, a page at a time.
  const loadMore = () => {
    if (loadingMore) return;
    if (activeTag !== null) {
      loadMoreOfTab(activeTag);
      return;
    }
    const last = rawItems[rawItems.length - 1];
    if (reachedEnd.current || !last || rawItems.length >= total) return;
    setLoadingMore(true);
    fetchRecentItems(50, last.shared_at)
      .then((res) => {
        const next = appendPage(rawItems, res.items);
        if (next.length === rawItems.length) reachedEnd.current = true;
        setRawItems(next);
      })
      .catch(() => {})
      .finally(() => setLoadingMore(false));
  };
  const shownAll =
    activeTag === UNCLASSIFIED
      ? waitingItems ?? rawItems.filter((it) => it.classification_status === 'unclassified')
      : tagList ?? rawItems;
  // Tag lock: a locked tag's memos stay out of every list until the PIN
  // opens them; the locked tab itself shows only the lock until then.
  const tabClosed = !!activeTag && activeTag !== UNCLASSIFIED && tagLock.tags.has(activeTag) && !tagLock.open;
  const filtered = tabClosed ? [] : shownAll.filter((it) => !hiddenByTagLock(it));
  const openLockedTags = async () => {
    if (await askPin('check', { prompt: S.bioPromptTag, cancel: COMMON.cancel })) openTags();
  };
  const toggleTagLock = async (tag: string) => {
    const next = !tagLock.tags.has(tag);
    if (next && !(await hasPin()) && !(await askPin('set'))) return;
    try {
      const res = await setTagLocked(tag, next);
      setLockedTags(res.tags);
      if (next) {
        closeTags();
        forgetWeekly().catch(() => {});
      }
      load();
      loadTag(tag);
    } catch (err) {
      // Free already has its one locked tag: Pro has no limit.
      if (isTagLockLimit(err)) navigation.navigate('Paywall', { reason: 'tag_lock' });
      // The server may still be finishing a big tag: look again shortly.
      else if (isTimeout(err)) {
        setError(S.lockCheckLater);
        refreshLockedTags().then(() => load());
      } else setError(friendlyError(err));
    }
  };
  const unclassifiedCount = plan?.unclassifiedCount ?? rawItems.filter((it) => it.classification_status === 'unclassified').length;
  const backlogCount = plan?.backlogCount ?? unclassifiedCount;
  const classifyLeft = usesLeft(plan, 'classify') ?? 0;
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
      if (isTimeout(err) || isAlreadyRunning(err)) {
        setSortHeld(true);
        showToast(S.sortCheckLater);
      } else {
        showToast(friendlyError(err));
      }
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
        {composing.map((tag, i) => (
          <ProgressRow key={tag + i} theme={theme} label={S.composing(tag)} style={styles.shareQueueRow} />
        ))}
        {hasPending && <ProgressRow theme={theme} label={sortingSlow ? S.sortingSlow : S.sorting(pendingCount)} style={styles.shareQueueRow} />}
        {shareQueue.pending > 0 &&
          (shareQueue.waitingConsent ? (
            <Pressable onPress={() => navigation.navigate('AiConsent')} hitSlop={6} style={styles.shareQueueRow}>
              <Text style={[styles.shareQueueText, { color: theme.accent }]}>{S.sharedWaitingConsent(shareQueue.pending)}</Text>
            </Pressable>
          ) : (
            <ProgressRow theme={theme} label={S.sharedSaving(shareQueue.pending)} spinning={shareQueue.running} style={styles.shareQueueRow} />
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
                fontFamily: BODY_KR,
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
                  fontFamily: BODY_KR,
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
          <TabChip key={tag} label={tag} active={activeTag === tag} locked={tagLock.tags.has(tag)} theme={theme} onPress={() => changeTag(tag)} />
        ))}
        <TabAddChip theme={theme} onPress={() => navigation.navigate('TabPicker')} />
      </ScrollView>

      {offerImport && activeTag !== UNCLASSIFIED && !selectMode && (
        <View style={[styles.backlog, { paddingHorizontal: boxed ? 24 : 26 }]}>
          <View style={styles.backlogText}>
            <Text style={[styles.backlogTitle, { color: theme.ink }]} numberOfLines={2}>
              {S.importOld}
            </Text>
          </View>
          <GhostButton label={S.importLater} theme={theme} size="sm" flex={0} onPress={() => closeImportOffer(false)} />
          <SolidButton label={S.importPick} theme={theme} size="sm" flex={0} onPress={() => closeImportOffer(true)} />
        </View>
      )}

      {activeTag === UNCLASSIFIED && (
        // One compact strip, so the list underneath stays visible.
        <View style={[styles.backlog, { paddingHorizontal: boxed ? 24 : 26 }]}>
          <View style={styles.backlogText}>
            <Text style={[styles.backlogTitle, { color: theme.ink }]} numberOfLines={1}>
              {S.waitingCount(unclassifiedCount)}
            </Text>
          </View>
          {!!plan && !noAiConsent && backlogCount > 0 && isLowOnUses(classifyLeft) && (
            <Bubble theme={theme} tail="right" label={classifyLeft === 0 ? S.refillsOn(resetLabel(plan?.resetsAt)) : USES.left(classifyLeft)} style={styles.backlogBubble} />
          )}
          {(noAiConsent || backlogCount > 0) && (
            <SolidButton
              label={noAiConsent ? S.allowAi : classifyLeft > 0 ? S.sortWithAi(Math.min(classifyLeft, backlogCount)) : S.sortWithPro}
              theme={theme}
              size="sm"
              flex={0}
              loading={sorting}
              disabled={sortHeld && !noAiConsent}
              onPress={noAiConsent ? () => navigation.navigate('AiConsent') : classifyLeft === 0 ? sortBacklog : () => setAskSort(true)}
            />
          )}
        </View>
      )}

      {askSort && (
        <ConfirmPopup
          theme={theme}
          title={S.sortTitle}
          body={S.sortBody}
          onNo={() => setAskSort(false)}
          onYes={() => {
            setAskSort(false);
            sortBacklog();
          }}
        />
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
                        // The server takes 50 at most: the newest 50 in list order, and the sheet says so.
                        const usable = picked.usable.slice(0, 50);
                        navigation.navigate('Compose', { tag: activeTag, count: usable.length, lockedOut: picked.locked, composedOut: picked.composed, itemIds: usable.map((it) => it.id), pickedCount: ids.length, overFifty: picked.usable.length > 50, suggested: suggestFormat(usable) });
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
                    maxLength={30}
                    autoFocus
                    editable={!bulkApplying}
                    placeholder={bulkEditing === 'add' ? S.tagToAdd : S.tagToRemove}
                    placeholderTextColor={theme.sub}
                    onSubmitEditing={applyBulkTag}
                    style={{ flex: 1, color: theme.ink, fontFamily: BODY_KR, fontSize: 13.5, padding: 0, outlineWidth: 0 }}
                  />
                  {bulkApplying ? (
                    <ActivityIndicator color={theme.accent} size="small" />
                  ) : (
                    <Pressable onPress={applyBulkTag} disabled={!bulkTagDraft.trim()}>
                      <Text style={{ color: theme.accent, fontFamily: BODY_KR_MEDIUM, fontSize: 13.5 }}>
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
              <View style={styles.bulkBarActions}>
                <Pressable onPress={() => toggleTagLock(activeTag)} hitSlop={6}>
                  <Text style={[styles.bulkBarLink, { color: theme.sub }]}>{tagLock.tags.has(activeTag) ? S.unlockTag : S.lockTag}</Text>
                </Pressable>
                <Pressable onPress={() => setSelectMode(true)} hitSlop={6}>
                  <Text style={[styles.bulkBarLink, { color: theme.sub }]}>{S.select}</Text>
                </Pressable>
              </View>
            </View>
          )}
        </View>
      )}

      {tabClosed ? (
        <View style={styles.lockedTag}>
          <LockIcon size={22} color={theme.sub} strokeWidth={1.3} />
          <Text style={[styles.lockedTagText, { color: theme.sub }]}>{S.tagLocked}</Text>
          <SolidButton label={S.openTag} theme={theme} size="sm" flex={0} onPress={openLockedTags} />
        </View>
      ) : (
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
          // Few rows are on screen at once, so there's nothing to gain from it.
          removeClippedSubviews={false}
          data={items}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          ListFooterComponent={loadingMore ? <ActivityIndicator color={theme.sub} style={styles.moreSpinner} /> : null}
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
      )}
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
  backlogTitle: { fontSize: 14, fontFamily: BODY_KR_MEDIUM },
  backlogBubble: { alignSelf: 'center', marginRight: 2 },
  headPad: {},
  shareQueueRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  shareQueueText: { fontFamily: BODY_KR, fontSize: 12.5 },
  moreSpinner: { marginTop: 16 },
  brandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brandRowActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heroWrap: { position: 'relative' },
  heroBack: { position: 'absolute', top: 6, left: 6, right: -6, bottom: -6 },
  heroBox: { position: 'relative', overflow: 'hidden' },
  heroDot: { width: 8, height: 8, borderRadius: 4 },
  numRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, marginTop: 10 },
  numSuffix: { fontSize: 14, lineHeight: 21, paddingBottom: 9, fontFamily: BODY_KR },
  heroFoot: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 18 },
  tabsScroll: { flexGrow: 0 },
  // Vertical breathing room: a horizontal ScrollView clips its content to
  // the content's own (often fractional) height on Android, which shaved
  // the bottom edge off outlined pill tabs.
  tabs: { flexDirection: 'row', paddingVertical: 2 },
  list: { flex: 1 },
  composeLink: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  lockedTag: { alignItems: 'center', gap: 12, paddingTop: 72, paddingHorizontal: 26 },
  lockedTagText: { fontFamily: BODY_KR, fontSize: 14 },
  bulkBar: { paddingTop: 12 },
  bulkBarRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', rowGap: 8 },
  bulkBarText: { fontSize: 12.5, fontFamily: BODY_KR },
  // Wraps to a second line when the actions don't fit (long languages, many selected).
  bulkBarActions: { flexDirection: 'row', flexShrink: 1, flexWrap: 'wrap', justifyContent: 'flex-end', columnGap: 14, rowGap: 6 },
  bulkBarLink: { fontSize: 12.5, fontFamily: BODY_KR_MEDIUM },
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
