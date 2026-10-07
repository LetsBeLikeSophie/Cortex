import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useShareIntent } from 'expo-share-intent';

import { useTheme } from '../theme/ThemeContext';
import { MONO, Theme, emToTracking } from '../theme/themes';
import { copyFor } from '../data/content';
import { TagTab, loadHomeTabs } from '../data/tabs';
import { fetchRecentItems, addTag, removeTag, ApiItem } from '../api/client';
import { toRecentItem, relativeTime } from '../api/format';
import { RecentRow } from '../components/ListItems';
import { AsyncStateView } from '../components/AsyncStateView';
import { TabChip, TabAddChip } from '../components/Chips';
import { Pulse } from '../components/Pulse';
import { StatsIcon, ProfileIcon, TrashIcon } from '../components/Icons';
import type { RootStackParamList } from '../navigation/types';

// The hero stat box's own front-layer fill -- mirrors cardShellStyle in
// ListItems.tsx (line/bordered/card unchanged there, layered here reuses
// the same offset-back-View idea via heroBack in the JSX below, not a
// second branch of this function).
function heroShellStyle(theme: Theme): ViewStyle {
  switch (theme.list) {
    case 'line':
      return {};
    case 'bordered':
      return {
        backgroundColor: theme.surface,
        borderWidth: 1,
        borderColor: theme.line,
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
      };
    case 'card':
      return {
        backgroundColor: theme.surface,
        borderWidth: theme.surfaceEdge ? 1 : 0,
        borderColor: theme.surfaceEdge ?? undefined,
        borderRadius: theme.cardRadius + 6,
        padding: 22,
        paddingTop: 24,
        paddingBottom: 20,
      };
  }
}

export default function HomeScreen() {
  const { theme, layoutKey, paletteKey } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [customTabs, setCustomTabs] = useState<TagTab[]>([]);
  const [activeTag, setActiveTag] = useState<TagTab | null>(null);
  const [rawItems, setRawItems] = useState<ApiItem[]>([]);
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
  // True for any boxed-away-from-the-edge layout ('card' (retired),
  // 'bordered', 'layered') -- drives outer padding/spacing choices that
  // apply the same way across all of them. The hero box's own
  // background/border/stack rendering is more specific, see heroShellStyle
  // below.
  const boxed = theme.list !== 'line';
  // TabChip/TagChip/etc. (Chips.tsx) still gate pill-vs-underline on the
  // literal 'card' value only -- thinBorder/layered/layeredVintage don't
  // have a pill-tab look wired up yet, so the tab row has to keep matching
  // whatever Chips.tsx actually renders instead of following `boxed`.
  const pillTabs = theme.list === 'card';
  const tech = theme.copy === 'tech';
  const txt = copyFor(theme.copy);

  const load = React.useCallback(() => {
    setLoading(true);
    fetchRecentItems()
      .then((res) => {
        setRawItems(res.items);
        setTotal(res.total);
        setError(null);
      })
      // Leave whatever was already on screen alone -- a transient failure
      // (the backend mid-restart, a slow request timing out) shouldn't
      // wipe real saved items out from under someone who's just browsing.
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
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
        setActiveTag((current) => (current && !tabs.includes(current) ? null : current));
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
    navigation.navigate('SaveSheet', {
      sharedImageUri: shareIntent.files?.[0]?.path,
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
    const call = bulkEditing === 'add' ? addTag : removeTag;
    await Promise.all(ids.map((id) => call(id, tag).catch(() => {})));
    setBulkApplying(false);
    setBulkEditing(null);
    setBulkTagDraft('');
    setSelectMode(false);
    setSelectedIds(new Set());
    load();
  };

  const filtered = activeTag
    ? rawItems.filter((it) => it.tags.includes(activeTag) || it.user_tags.includes(activeTag))
    : rawItems;
  const items = filtered.map(toRecentItem);

  // Always off the unfiltered list -- the hero card describes the whole
  // archive, not whatever tag tab happens to be active.
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const weekCount = rawItems.filter((it) => new Date(it.shared_at).getTime() >= weekAgo).length;
  const lastSaved = rawItems[0] ? relativeTime(rawItems[0].shared_at) : null;

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: theme.bg }]} edges={['top']}>
      <View style={[styles.headPad, { paddingHorizontal: boxed ? 24 : 26, paddingTop: boxed ? 26 : 30 }]}>
        <View style={styles.brandRow}>
          <Text style={{ fontFamily: MONO, fontSize: 11, letterSpacing: emToTracking(0.26, 11), color: theme.accent }}>
            CORTEX
          </Text>
          <View style={styles.brandRowActions}>
            <Pressable
              onPress={() => navigation.navigate('Trash')}
              style={[styles.iconButton, { borderColor: theme.line }]}
              hitSlop={6}
            >
              <TrashIcon size={14} color={theme.ink} strokeWidth={1.3} />
            </Pressable>
            <Pressable
              onPress={() => navigation.navigate('Stats')}
              style={[styles.iconButton, { borderColor: theme.line }]}
              hitSlop={6}
            >
              <StatsIcon size={15} color={theme.ink} strokeWidth={1.4} />
            </Pressable>
            <Pressable
              onPress={() => navigation.navigate('Profile')}
              style={[styles.iconButton, { borderColor: theme.line }]}
              hitSlop={6}
            >
              <ProfileIcon size={15} color={theme.ink} strokeWidth={1.4} />
            </Pressable>
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
            <View
              style={[styles.heroBack, { backgroundColor: theme.cardStack, borderRadius: theme.cardRadius + 6 }]}
            />
          )}
          <View style={[styles.heroBox, heroShellStyle(theme)]}>
            {theme.pulse && (
              <Svg width={150} height={150} style={styles.heroGlow} pointerEvents="none">
                <Defs>
                  <RadialGradient id="glow" cx="50%" cy="50%" r="50%">
                    <Stop offset="0%" stopColor={theme.accent} stopOpacity={0.16} />
                    <Stop offset="65%" stopColor={theme.accent} stopOpacity={0} />
                  </RadialGradient>
                </Defs>
                <Circle cx={75} cy={75} r={75} fill="url(#glow)" />
              </Svg>
            )}

            <Text
              style={{
                fontFamily: tech ? MONO : 'IBMPlexSansKR_400Regular',
                fontSize: tech ? 10.5 : 13.5,
                letterSpacing: tech ? emToTracking(0.22, 10.5) : emToTracking(0.01, 13.5),
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
              <Pulse color={theme.accent} active={theme.pulse} />
              <Text
                style={{
                  fontFamily: tech ? MONO : 'IBMPlexSansKR_400Regular',
                  fontSize: tech ? 11 : 12.5,
                  letterSpacing: tech ? emToTracking(0.1, 11) : emToTracking(0.01, 12.5),
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
        {customTabs.map((tag) => (
          <TabChip key={tag} label={tag} active={activeTag === tag} theme={theme} onPress={() => changeTag(tag)} />
        ))}
        <TabAddChip theme={theme} onPress={() => navigation.navigate('TabPicker')} />
      </ScrollView>

      {activeTag && items.length > 0 && (
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
            <Pressable onPress={() => setSelectMode(true)} style={styles.bulkBarRow}>
              <Text style={[styles.bulkBarLink, { color: theme.sub }]}>선택</Text>
            </Pressable>
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
          data={items}
          keyExtractor={(item, i) => item.no + i}
          renderItem={({ item, index }) => {
            const rawId = filtered[index].id;
            return (
              <RecentRow
                item={item}
                theme={theme}
                tech={tech}
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

const styles = StyleSheet.create({
  screen: { flex: 1 },
  headPad: {},
  brandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brandRowActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroWrap: { position: 'relative' },
  heroBack: { position: 'absolute', top: 6, left: 6, right: -6, bottom: -6 },
  heroBox: { position: 'relative', overflow: 'hidden' },
  heroGlow: { position: 'absolute', top: -40, right: -30 },
  numRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, marginTop: 10 },
  numSuffix: { fontSize: 14, lineHeight: 21, paddingBottom: 9, fontFamily: 'IBMPlexSansKR_400Regular' },
  heroFoot: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 18 },
  tabsScroll: { flexGrow: 0 },
  tabs: { flexDirection: 'row' },
  list: { flex: 1 },
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
