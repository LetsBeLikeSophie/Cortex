import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useShareIntent } from 'expo-share-intent';

import { useTheme } from '../theme/ThemeContext';
import { MONO, OUTLINE, Theme, allEdges, conceptOf, emToTracking } from '../theme/themes';
import { copyFor } from '../data/content';
import { TagTab, loadHomeTabs } from '../data/tabs';
import { fetchRecentItems, fetchPlan, classifyBacklog, addTag, removeAiTag, removeTag, ApiItem, ComposeFormat, Plan, friendlyError } from '../api/client';
import { toRecentItem, relativeTime } from '../api/format';
import { RecentRow } from '../components/ListItems';
import { LayeredBack, VintageWallpaper } from '../components/Decor';
import { AsyncStateView } from '../components/AsyncStateView';
import { TabChip, TabAddChip, PileTabChip } from '../components/Chips';
import { IconButton, SolidButton } from '../components/Buttons';
import { SparkleIcon, StatsIcon, ProfileIcon, TrashIcon } from '../components/Icons';
import { showToast } from '../native/toast';
import type { RootStackParamList } from '../navigation/types';

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
  const [plan, setPlan] = useState<Plan | null>(null);
  const [sorting, setSorting] = useState(false);
  const [total, setTotal] = useState(0);
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
  useEffect(() => {
    if (!hasShareIntent) return;
    // Several images at once (ACTION_SEND_MULTIPLE, e.g. Mehh's screenshot
    // cleanup) go to the sheet's bulk mode; one stays the single-image flow.
    // The native module already copied each one into our cache dir, so the
    // sender trashing its originals afterwards doesn't lose them.
    const images = (shareIntent.files ?? []).filter((f) => f.path && (f.mimeType ?? 'image/').startsWith('image/'));
    navigation.navigate('SaveSheet', {
      sharedImageUri: images.length === 1 ? images[0].path : undefined,
      sharedImageUris: images.length > 1 ? images.map((f) => f.path) : undefined,
      sharedUrl: shareIntent.webUrl ?? undefined,
      sharedText: shareIntent.webUrl ? undefined : shareIntent.text ?? undefined,
    });
    resetShareIntent();
  }, [hasShareIntent, shareIntent, navigation, resetShareIntent]);

  // Switching tabs invalidates whatever was selected (it was a selection
  // within the old filtered list), and "모두" has no filtered group to bulk
  // -edit at all, so leaving a tag tab always drops out of select mode too.
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
        bulkEditing === 'add' ? `${done}개에 '${tag}'를 붙였어요` : `${done}개에서 '${tag}'를 뺐어요`,
        absent ? `${absent}개는 원래 없었어요` : null,
        failed ? `실패 ${failed}개` : null,
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

  const listSource = rawItems;
  const filtered =
    activeTag === UNCLASSIFIED
      ? rawItems.filter((it) => it.classification_status === 'unclassified')
      : activeTag
        ? rawItems.filter((it) => it.tags.includes(activeTag) || it.user_tags.includes(activeTag))
        : rawItems;
  const unclassifiedCount = plan?.unclassifiedCount ?? rawItems.filter((it) => it.classification_status === 'unclassified').length;
  const classifyLeft = plan ? Math.max(0, plan.classify.limit - plan.classify.used) : 0;

  // "AI로 정리" in the 미분류함 tab: classify as much of the backlog as this
  // month's quota covers; with nothing left, it's the upgrade prompt.
  const sortBacklog = async () => {
    if (classifyLeft === 0) {
      navigation.navigate('Paywall', { reason: 'classify' });
      return;
    }
    setSorting(true);
    try {
      await classifyBacklog();
    } finally {
      setSorting(false);
      load();
    }
  };
  const items = filtered.map(toRecentItem);

  // Always off the unfiltered list -- the hero card describes the whole
  // archive, not whatever tag tab happens to be active.
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const weekCount = rawItems.filter((it) => new Date(it.shared_at).getTime() >= weekAgo).length;
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
            <IconButton theme={theme} onPress={() => navigation.navigate('Trash')} label="휴지통">
              <TrashIcon size={14} color={theme.ink} strokeWidth={1.3} />
            </IconButton>
            <IconButton theme={theme} onPress={() => navigation.navigate('Stats')} label="통계">
              <StatsIcon size={15} color={theme.ink} strokeWidth={1.4} />
            </IconButton>
            <IconButton theme={theme} onPress={() => navigation.navigate('Profile')} label="내 계정">
              <ProfileIcon size={15} color={theme.ink} strokeWidth={1.4} />
            </IconButton>
          </View>
        </View>

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
        <TabChip label="모두" active={activeTag === null} theme={theme} onPress={() => changeTag(null)} />
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
              {unclassifiedCount}건 정리 대기
            </Text>
            <Text style={[styles.backlogSub, { color: theme.sub }]} numberOfLines={1}>
              {classifyLeft > 0 ? `이번 달 AI 정리 ${classifyLeft}건 남음` : `${resetLabel(plan?.resetsAt)}에 다시 생겨요`}
            </Text>
          </View>
          <SolidButton
            label={classifyLeft > 0 ? `AI로 정리 (${Math.min(classifyLeft, unclassifiedCount)})` : 'Pro로 정리'}
            theme={theme}
            size="sm"
            flex={0}
            loading={sorting}
            onPress={sortBacklog}
          />
        </View>
      )}

      {activeTag && activeTag !== UNCLASSIFIED && items.length > 0 && (
        <View style={[styles.bulkBar, { paddingHorizontal: boxed ? 24 : 26 }]}>
          {selectMode ? (
            <>
              <View style={styles.bulkBarRow}>
                <Text style={[styles.bulkBarText, { color: theme.sub }]}>{selectedIds.size}개 선택됨</Text>
                <View style={styles.bulkBarActions}>
                  <Pressable onPress={() => setBulkEditing('add')} disabled={selectedIds.size === 0}>
                    <Text style={[styles.bulkBarLink, { color: theme.accent, opacity: selectedIds.size ? 1 : 0.4 }]}>
                      태그 추가
                    </Text>
                  </Pressable>
                  <Pressable onPress={() => setBulkEditing('remove')} disabled={selectedIds.size === 0}>
                    <Text style={[styles.bulkBarLink, { color: theme.accent, opacity: selectedIds.size ? 1 : 0.4 }]}>
                      태그 제거
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
                    <Text style={[styles.bulkBarLink, { color: theme.sub }]}>취소</Text>
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
                    placeholder={bulkEditing === 'add' ? '추가할 태그' : '제거할 태그'}
                    placeholderTextColor={theme.sub}
                    onSubmitEditing={applyBulkTag}
                    style={{ flex: 1, color: theme.ink, fontFamily: 'IBMPlexSansKR_400Regular', fontSize: 13.5, padding: 0, outlineWidth: 0 }}
                  />
                  {bulkApplying ? (
                    <ActivityIndicator color={theme.accent} size="small" />
                  ) : (
                    <Pressable onPress={applyBulkTag} disabled={!bulkTagDraft.trim()}>
                      <Text style={{ color: theme.accent, fontFamily: 'IBMPlexSansKR_500Medium', fontSize: 13.5 }}>
                        적용
                      </Text>
                    </Pressable>
                  )}
                </View>
              )}
            </>
          ) : (
            <View style={styles.bulkBarRow}>
              {/* "모아서 만들기": this tab's items -> one course/list/summary memo. */}
              {items.length >= 2 ? (
                <Pressable
                  onPress={() => navigation.navigate('Compose', { tag: activeTag, count: items.length, suggested: suggestFormat(rawItems.filter((it) => it.tags.includes(activeTag) || it.user_tags.includes(activeTag))) })}
                  hitSlop={6}
                  style={styles.composeLink}
                >
                  <SparkleIcon color={theme.accent} size={13} strokeWidth={1.5} />
                  <Text style={[styles.bulkBarLink, { color: theme.accent }]}>모아서 만들기</Text>
                </Pressable>
              ) : (
                <View />
              )}
              <Pressable onPress={() => setSelectMode(true)} hitSlop={6}>
                <Text style={[styles.bulkBarLink, { color: theme.sub }]}>선택</Text>
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
        emptyText="아직 저장된 기억이 없어요."
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
  if (!iso) return '다음 달 1일';
  const d = new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000); // Korea time
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  backlog: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 12, paddingBottom: 4 },
  backlogText: { flex: 1, minWidth: 0 },
  backlogTitle: { fontSize: 14, fontFamily: 'IBMPlexSansKR_500Medium' },
  backlogSub: { fontSize: 12, marginTop: 2, fontFamily: 'IBMPlexSansKR_400Regular' },
  headPad: {},
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
  bulkBarRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bulkBarText: { fontSize: 12.5, fontFamily: 'IBMPlexSansKR_400Regular' },
  bulkBarActions: { flexDirection: 'row', gap: 16 },
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
