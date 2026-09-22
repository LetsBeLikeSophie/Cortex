import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useShareIntent } from 'expo-share-intent';

import { useTheme } from '../theme/ThemeContext';
import { MONO, emToTracking } from '../theme/themes';
import { copyFor } from '../data/content';
import { fetchRecentItems, fetchItemsBySource, fetchPinnedItems, ApiItem, ItemSource } from '../api/client';
import { toRecentItem, relativeTime, sourceLabel, SOURCE_ORDER } from '../api/format';
import { RecentRow } from '../components/ListItems';
import { TabChip } from '../components/Chips';
import { Pulse } from '../components/Pulse';
import { StatsIcon, ProfileIcon, TrashIcon, SourceIcon, StarIcon } from '../components/Icons';
import type { RootStackParamList } from '../navigation/types';

// Home's tab strip is fixed, not user-picked: 즐겨찾기 (pinned items, the
// screen's default view) plus one tab per channel (every item from that
// source, regardless of pinned state). Search already covers "find
// anything by tag/text" -- see api/format.ts's captureTypeLabel/sourceLabel
// and the backend's searchItems -- so Home's own job narrowed to "what do I
// want to get back to quickly," not a second, weaker way to filter everything.
const FAVORITES_TAB = 'favorites' as const;
type HomeTab = typeof FAVORITES_TAB | ItemSource;

export default function HomeScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [activeTab, setActiveTab] = useState<HomeTab>(FAVORITES_TAB);

  // Hero stats (total/this-week/last-saved) always reflect the whole
  // archive, not whatever tab is active -- a separate, unfiltered fetch
  // from the tab-specific list below.
  const [rawItems, setRawItems] = useState<ApiItem[]>([]);
  const [total, setTotal] = useState(0);
  const [heroError, setHeroError] = useState<string | null>(null);

  const [listItems, setListItems] = useState<ApiItem[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const card = theme.list === 'card';
  const tech = theme.copy === 'tech';
  const txt = copyFor(theme.copy);

  const loadHero = useCallback(() => {
    fetchRecentItems()
      .then((res) => {
        setRawItems(res.items);
        setTotal(res.total);
        setHeroError(null);
      })
      // Leave whatever was already on screen alone -- a transient failure
      // shouldn't wipe the hero card out from under someone just browsing.
      .catch((err) => setHeroError(err instanceof Error ? err.message : String(err)));
  }, []);

  const loadList = useCallback((tab: HomeTab) => {
    setListLoading(true);
    const request = tab === FAVORITES_TAB ? fetchPinnedItems() : fetchItemsBySource(tab);
    request
      .then((res) => {
        setListItems(res.items);
        setListError(null);
      })
      .catch((err) => setListError(err instanceof Error ? err.message : String(err)))
      .finally(() => setListLoading(false));
  }, []);

  // Re-runs on tab switch too, not just on focus -- loadList's identity
  // changes with `activeTab`, and useFocusEffect re-fires on a dependency
  // change the same way a plain effect would while already focused.
  useFocusEffect(
    useCallback(() => {
      loadHero();
      loadList(activeTab);
    }, [loadHero, loadList, activeTab])
  );

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

  const items = listItems.map(toRecentItem);

  // Always off the unfiltered list -- the hero card describes the whole
  // archive, not whatever tab happens to be active.
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const weekCount = rawItems.filter((it) => new Date(it.shared_at).getTime() >= weekAgo).length;
  const lastSaved = rawItems[0] ? relativeTime(rawItems[0].shared_at) : null;

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: theme.bg }]} edges={['top']}>
      <View style={[styles.headPad, { paddingHorizontal: card ? 24 : 26, paddingTop: card ? 26 : 30 }]}>
        <View style={styles.brandRow}>
          <Text style={{ fontFamily: MONO, fontSize: 11, letterSpacing: emToTracking(0.26, 11), color: theme.accent }}>
            CORTEX
          </Text>
          <View style={styles.brandRowActions}>
            <Pressable
              onPress={() => navigation.navigate('Profile')}
              style={[styles.iconButton, { borderColor: theme.line }]}
              hitSlop={6}
            >
              <ProfileIcon size={15} color={theme.ink} strokeWidth={1.4} />
            </Pressable>
            <Pressable
              onPress={() => navigation.navigate('Stats')}
              style={[styles.iconButton, { borderColor: theme.line }]}
              hitSlop={6}
            >
              <StatsIcon size={15} color={theme.ink} strokeWidth={1.4} />
            </Pressable>
            <Pressable
              onPress={() => navigation.navigate('Trash')}
              style={[styles.iconButton, { borderColor: theme.line }]}
              hitSlop={6}
            >
              <TrashIcon size={14} color={theme.ink} strokeWidth={1.3} />
            </Pressable>
          </View>
        </View>

        <View
          style={[
            styles.heroBox,
            card
              ? {
                  backgroundColor: theme.surface,
                  borderWidth: theme.surfaceEdge ? 1 : 0,
                  borderColor: theme.surfaceEdge ?? undefined,
                  borderRadius: theme.cardRadius + 6,
                  padding: 22,
                  paddingTop: 24,
                  paddingBottom: 20,
                  marginTop: 20,
                  ...(theme.dark ? null : styles.heroShadow),
                }
              : { marginTop: 22 },
          ]}
        >
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
            <Text
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

      <View
        style={[
          styles.tabs,
          {
            alignItems: card ? 'center' : 'flex-start',
            gap: card ? 8 : 18,
            paddingHorizontal: card ? 24 : 26,
            paddingTop: card ? 20 : 28,
            paddingBottom: card ? 12 : 0,
            borderBottomWidth: card ? 0 : 1,
            borderBottomColor: theme.line,
          },
        ]}
      >
        <TabChip
          label="즐겨찾기"
          icon={<StarIcon size={13} color={activeTab === FAVORITES_TAB ? (card ? theme.bg : theme.ink) : theme.sub} strokeWidth={1.3} filled={activeTab === FAVORITES_TAB} />}
          active={activeTab === FAVORITES_TAB}
          theme={theme}
          onPress={() => setActiveTab(FAVORITES_TAB)}
        />
        {SOURCE_ORDER.map((source) => (
          <TabChip
            key={source}
            label={sourceLabel(source, tech)}
            icon={<SourceIcon source={source} size={13} color={activeTab === source ? (card ? theme.bg : theme.ink) : theme.sub} strokeWidth={1.3} />}
            active={activeTab === source}
            theme={theme}
            onPress={() => setActiveTab(source)}
          />
        ))}
      </View>

      {listLoading && items.length === 0 ? (
        <ActivityIndicator color={theme.accent} style={{ marginTop: 40 }} />
      ) : items.length === 0 && listError ? (
        <View style={{ marginTop: 40, alignItems: 'center', paddingHorizontal: 24 }}>
          <Text style={{ color: theme.sub, textAlign: 'center', fontFamily: 'IBMPlexSansKR_400Regular' }}>
            불러오지 못했어요.{'\n'}
            {listError}
          </Text>
          <Pressable onPress={() => loadList(activeTab)} style={[styles.retryButton, { borderColor: theme.line }]}>
            <Text style={{ color: theme.ink, fontFamily: 'IBMPlexSansKR_500Medium', fontSize: 13.5 }}>다시 시도</Text>
          </Pressable>
        </View>
      ) : items.length === 0 ? (
        <Text style={{ color: theme.sub, textAlign: 'center', marginTop: 40, fontFamily: 'IBMPlexSansKR_400Regular' }}>
          {activeTab === FAVORITES_TAB ? '아직 즐겨찾기한 기억이 없어요.' : '아직 저장된 기억이 없어요.'}
        </Text>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item, i) => item.no + i}
          renderItem={({ item, index }) => (
            <RecentRow
              item={item}
              theme={theme}
              tech={tech}
              onPress={() => navigation.navigate('ItemDetail', { item: listItems[index] })}
            />
          )}
          contentContainerStyle={{ paddingHorizontal: card ? 24 : 26, paddingTop: card ? 12 : 0, paddingBottom: 24 }}
          style={styles.list}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  headPad: {},
  retryButton: { marginTop: 16, borderWidth: 1, borderRadius: 999, paddingHorizontal: 20, paddingVertical: 10 },
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
  heroBox: { position: 'relative', overflow: 'hidden' },
  heroShadow: { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 18, shadowOffset: { width: 0, height: 6 }, elevation: 2 },
  heroGlow: { position: 'absolute', top: -40, right: -30 },
  numRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, marginTop: 10 },
  numSuffix: { fontSize: 14, lineHeight: 21, paddingBottom: 9, fontFamily: 'IBMPlexSansKR_400Regular' },
  heroFoot: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 18 },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 10 },
  list: { flex: 1 },
});
