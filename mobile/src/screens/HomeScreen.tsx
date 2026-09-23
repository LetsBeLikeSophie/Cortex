import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useShareIntent } from 'expo-share-intent';

import { useTheme } from '../theme/ThemeContext';
import { MONO, emToTracking } from '../theme/themes';
import { copyFor, DEFAULT_QUERY, SearchResult } from '../data/content';
import { TagTab, loadHomeTabs } from '../data/tabs';
import { fetchRecentItems, fetchPinnedItems, searchItems as apiSearchItems, restoreItem, ApiItem } from '../api/client';
import { toRecentItem, toSearchResult, relativeTime } from '../api/format';
import { RecentRow, ResultRow } from '../components/ListItems';
import { TabChip, TabAddChip } from '../components/Chips';
import { Pulse } from '../components/Pulse';
import { ProfileIcon, TrashIcon, StarIcon, SearchIcon } from '../components/Icons';
import type { RootStackParamList } from '../navigation/types';

// Home's tab strip: 즐겨찾기 (pinned items, the default view -- typing in
// the search box below covers "find anything by tag/text/channel", so
// Home's own tabs narrowed to "what do I want to get back to quickly")
// plus whatever tag tabs the user picks in TabPickerScreen.
const FAVORITES_TAB = 'favorites' as const;
type HomeTab = typeof FAVORITES_TAB | TagTab;

export default function HomeScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [customTabs, setCustomTabs] = useState<TagTab[]>([]);
  const [activeTab, setActiveTab] = useState<HomeTab>(FAVORITES_TAB);

  const [rawItems, setRawItems] = useState<ApiItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [pinnedItems, setPinnedItems] = useState<ApiItem[]>([]);
  const [pinnedLoading, setPinnedLoading] = useState(true);
  const [pinnedError, setPinnedError] = useState<string | null>(null);

  // A persistent search box right on Home instead of a separate screen --
  // typing here replaces the tab-filtered list below with live results,
  // same request/debounce/restore logic the old SearchScreen had.
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchRaw, setSearchRaw] = useState<ApiItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const card = theme.list === 'card';
  const tech = theme.copy === 'tech';
  const txt = copyFor(theme.copy);
  const isSearching = query.trim().length > 0;

  const loadHero = useCallback(() => {
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

  const loadFavorites = useCallback(() => {
    setPinnedLoading(true);
    fetchPinnedItems()
      .then((res) => {
        setPinnedItems(res.items);
        setPinnedError(null);
      })
      .catch((err) => setPinnedError(err instanceof Error ? err.message : String(err)))
      .finally(() => setPinnedLoading(false));
  }, []);

  // Refetch whenever Home regains focus (e.g. after saving a new item, or
  // coming back from the tab picker) rather than just once on mount.
  useFocusEffect(
    useCallback(() => {
      loadHero();
      loadFavorites();
      loadHomeTabs().then((tabs) => {
        setCustomTabs(tabs);
        // A tab the user just removed in the picker can't stay selected.
        setActiveTab((current) => (current !== FAVORITES_TAB && !tabs.includes(current) ? FAVORITES_TAB : current));
      });
    }, [loadHero, loadFavorites])
  );

  // Debounced, same 300ms as the old SearchScreen -- searches everything
  // (title/snippet/tags/channel/method), including trash (badged below).
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setSearchResults([]);
      setSearchRaw([]);
      setSearchError(null);
      return;
    }
    setSearching(true);
    const timer = setTimeout(() => {
      apiSearchItems(trimmed)
        .then((res) => {
          setSearchResults(res.items.map((item) => toSearchResult(item, trimmed)));
          setSearchRaw(res.items);
          setSearchError(null);
        })
        .catch((err) => {
          setSearchResults([]);
          setSearchRaw([]);
          setSearchError(err instanceof Error ? err.message : String(err));
        })
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const restoreSearchResult = (itemId: string) => {
    setSearchRaw((current) => current.map((it) => (it.id === itemId ? { ...it, deleted_at: null } : it)));
    restoreItem(itemId).catch(() => {
      setSearchRaw((current) => current.map((it) => (it.id === itemId ? { ...it, deleted_at: new Date().toISOString() } : it)));
    });
  };

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

  const isFavorites = activeTab === FAVORITES_TAB;
  const filtered = isFavorites
    ? pinnedItems
    : rawItems.filter((it) => it.tags.includes(activeTab) || it.user_tags.includes(activeTab));
  const items = filtered.map(toRecentItem);
  const listLoading = isFavorites ? pinnedLoading : loading;
  const listError = isFavorites ? pinnedError : error;
  const reload = isFavorites ? loadFavorites : loadHero;

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

        <View
          style={[
            styles.searchBox,
            card
              ? {
                  marginTop: 16,
                  backgroundColor: theme.surface,
                  borderRadius: 999,
                  paddingHorizontal: 18,
                  paddingVertical: 12,
                  borderWidth: theme.dark ? 1 : 0,
                  borderColor: theme.line,
                  ...(theme.dark
                    ? { shadowColor: theme.accent, shadowOpacity: 0.1, shadowRadius: 3, elevation: 0 }
                    : styles.searchShadow),
                }
              : { marginTop: 20, borderBottomWidth: 1.5, borderBottomColor: theme.ink, paddingBottom: 10 },
          ]}
        >
          <SearchIcon color={theme.accent} size={16} strokeWidth={1.4} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            style={[styles.searchInput, { color: theme.ink, fontFamily: 'IBMPlexSansKR_400Regular', outlineWidth: 0 }]}
            selectionColor={theme.accent}
            placeholder={DEFAULT_QUERY}
            placeholderTextColor={theme.sub}
          />
        </View>

        {isSearching && (
          <View style={styles.searchMetaRow}>
            <Text
              style={{
                fontFamily: tech ? MONO : 'IBMPlexSansKR_400Regular',
                fontSize: tech ? 10.5 : 12.5,
                letterSpacing: tech ? emToTracking(0.12, 10.5) : emToTracking(0.01, 12.5),
                color: theme.sub,
              }}
            >
              {searching ? '검색 중...' : txt.hits(searchResults.length)}
            </Text>
            <Text
              style={{
                fontFamily: tech ? MONO : 'IBMPlexSansKR_400Regular',
                fontSize: tech ? 10.5 : 12.5,
                letterSpacing: tech ? emToTracking(0.12, 10.5) : emToTracking(0.01, 12.5),
                color: theme.sub,
              }}
            >
              최신순
            </Text>
          </View>
        )}
      </View>

      {isSearching ? (
        searching && searchResults.length === 0 ? (
          <ActivityIndicator color={theme.accent} style={{ marginTop: 40 }} />
        ) : searchError ? (
          <Text
            style={{
              color: theme.accent,
              textAlign: 'center',
              marginTop: 40,
              paddingHorizontal: 24,
              fontFamily: 'IBMPlexSansKR_400Regular',
            }}
          >
            검색 실패: {searchError}
          </Text>
        ) : searchResults.length === 0 ? (
          <Text style={{ color: theme.sub, textAlign: 'center', marginTop: 40, fontFamily: 'IBMPlexSansKR_400Regular' }}>
            일치하는 결과가 없어요.
          </Text>
        ) : (
          <FlatList
            data={searchResults}
            keyExtractor={(item, i) => item.hit + item.after + i}
            renderItem={({ item, index }) => {
              const raw = searchRaw[index];
              const trashed = !!raw?.deleted_at;
              return (
                <ResultRow
                  item={item}
                  theme={theme}
                  tech={tech}
                  trashed={trashed}
                  onRestore={() => raw && restoreSearchResult(raw.id)}
                  onPress={trashed ? undefined : () => navigation.navigate('ItemDetail', { item: raw })}
                />
              );
            }}
            contentContainerStyle={{ paddingHorizontal: card ? 24 : 26, paddingTop: card ? 12 : 0, paddingBottom: 24 }}
            style={styles.list}
          />
        )
      ) : (
        <>
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
              icon={<StarIcon size={13} color={isFavorites ? (card ? theme.bg : theme.ink) : theme.sub} strokeWidth={1.3} filled={isFavorites} />}
              active={isFavorites}
              theme={theme}
              onPress={() => setActiveTab(FAVORITES_TAB)}
            />
            {customTabs.map((tag) => (
              <TabChip key={tag} label={tag} active={activeTab === tag} theme={theme} onPress={() => setActiveTab(tag)} />
            ))}
            <TabAddChip theme={theme} onPress={() => navigation.navigate('TabPicker')} />
          </View>

          {listLoading && items.length === 0 ? (
            <ActivityIndicator color={theme.accent} style={{ marginTop: 40 }} />
          ) : items.length === 0 && listError ? (
            <View style={{ marginTop: 40, alignItems: 'center', paddingHorizontal: 24 }}>
              <Text style={{ color: theme.sub, textAlign: 'center', fontFamily: 'IBMPlexSansKR_400Regular' }}>
                불러오지 못했어요.{'\n'}
                {listError}
              </Text>
              <Pressable onPress={reload} style={[styles.retryButton, { borderColor: theme.line }]}>
                <Text style={{ color: theme.ink, fontFamily: 'IBMPlexSansKR_500Medium', fontSize: 13.5 }}>다시 시도</Text>
              </Pressable>
            </View>
          ) : items.length === 0 ? (
            <Text style={{ color: theme.sub, textAlign: 'center', marginTop: 40, fontFamily: 'IBMPlexSansKR_400Regular' }}>
              {isFavorites ? '아직 즐겨찾기한 기억이 없어요.' : '아직 저장된 기억이 없어요.'}
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
                  onPress={() => navigation.navigate('ItemDetail', { item: filtered[index] })}
                />
              )}
              contentContainerStyle={{ paddingHorizontal: card ? 24 : 26, paddingTop: card ? 12 : 0, paddingBottom: 24 }}
              style={styles.list}
            />
          )}
        </>
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
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  searchShadow: { shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 14, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  searchInput: { fontSize: 15.5, flex: 1, padding: 0 },
  searchMetaRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 10 },
  list: { flex: 1 },
});
