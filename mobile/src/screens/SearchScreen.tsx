import React, { useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useTheme } from '../theme/ThemeContext';
import { MONO, emToTracking } from '../theme/themes';
import { copyFor, DEFAULT_QUERY, SearchResult } from '../data/content';
import { searchItems as apiSearchItems, restoreItem, ApiItem } from '../api/client';
import { toSearchResult } from '../api/format';
import { ResultRow } from '../components/ListItems';
import { AsyncStateView } from '../components/AsyncStateView';
import { Heading } from '../components/Typography';
import { ChipQueryRow } from '../components/Chips';
import { SearchIcon } from '../components/Icons';
import { useChipQuery } from '../hooks/useChipQuery';
import type { RootStackParamList } from '../navigation/types';

interface Hit {
  result: SearchResult;
  raw: ApiItem;
}

type Row = { kind: 'header'; key: string; title: string; count: number } | { kind: 'item'; key: string; hit: Hit };

export default function SearchScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const card = theme.list === 'card';
  const tech = theme.copy === 'tech';
  const mono = tech;
  const txt = copyFor(theme.copy);

  const { chips, draft, includeChips, excludeChips, onChangeText, commitDraft, onKeyPress, toggleChip, removeChip } =
    useChipQuery();
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runSearch = React.useCallback((include: string[], exclude: string[]) => {
    setLoading(true);
    apiSearchItems(include, exclude)
      .then((res) => {
        const next = res.items
          .map((raw) => ({ raw, result: toSearchResult(raw, include) }))
          .sort((a, b) => b.result.matchedCount - a.result.matchedCount);
        setHits(next);
        setError(null);
      })
      .catch((err) => {
        setHits([]);
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (chips.length === 0) {
      setHits([]);
      setError(null);
      return;
    }
    const timer = setTimeout(() => {
      runSearch(includeChips.map((c) => c.text), excludeChips.map((c) => c.text));
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chips]);

  const retry = () => runSearch(includeChips.map((c) => c.text), excludeChips.map((c) => c.text));

  // Restoring a trashed hit in place -- flip its deleted_at locally instead
  // of re-running the whole search, so the row just loses its badge/button.
  const restore = (itemId: string) => {
    setHits((current) => current.map((h) => (h.raw.id === itemId ? { ...h, raw: { ...h.raw, deleted_at: null } } : h)));
    restoreItem(itemId).catch(() => {
      setHits((current) =>
        current.map((h) => (h.raw.id === itemId ? { ...h, raw: { ...h.raw, deleted_at: new Date().toISOString() } } : h))
      );
    });
  };

  const rows: Row[] = [];
  if (includeChips.length > 1) {
    const all = hits.filter((h) => h.result.matchedCount === includeChips.length);
    const some = hits.filter((h) => h.result.matchedCount < includeChips.length);
    if (all.length) {
      rows.push({ kind: 'header', key: 'h-all', title: '모두 포함', count: all.length });
      all.forEach((hit, i) => rows.push({ kind: 'item', key: 'all' + i, hit }));
    }
    if (some.length) {
      rows.push({ kind: 'header', key: 'h-some', title: '일부 포함', count: some.length });
      some.forEach((hit, i) => rows.push({ kind: 'item', key: 'some' + i, hit }));
    }
  } else {
    hits.forEach((hit, i) => rows.push({ kind: 'item', key: 'row' + i, hit }));
  }

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: theme.bg }]} edges={['top']}>
      <View style={{ paddingHorizontal: card ? 24 : 26, paddingTop: card ? 26 : 30 }}>
        <Heading theme={theme}>{txt.searchTitle}</Heading>

        <View
          style={[
            styles.searchBox,
            card
              ? {
                  marginTop: 16,
                  backgroundColor: theme.surface,
                  borderRadius: 999,
                  paddingHorizontal: 20,
                  paddingVertical: 14,
                  borderWidth: theme.dark ? 1 : 0,
                  borderColor: theme.line,
                  ...(theme.dark
                    ? { shadowColor: theme.accent, shadowOpacity: 0.1, shadowRadius: 3, elevation: 0 }
                    : styles.searchShadow),
                }
              : { marginTop: 24, borderBottomWidth: 1.5, borderBottomColor: theme.ink, paddingBottom: 12 },
          ]}
        >
          <SearchIcon color={theme.accent} size={18} strokeWidth={1.4} />
          <TextInput
            value={draft}
            onChangeText={onChangeText}
            onSubmitEditing={commitDraft}
            onKeyPress={onKeyPress}
            blurOnSubmit={false}
            style={[styles.searchInput, { color: theme.ink, fontFamily: 'IBMPlexSansKR_400Regular', outlineWidth: 0 }]}
            selectionColor={theme.accent}
            placeholder={chips.length > 0 ? '' : DEFAULT_QUERY}
            placeholderTextColor={theme.sub}
          />
        </View>

        <ChipQueryRow chips={chips} theme={theme} onToggle={toggleChip} onRemove={removeChip} />

        {chips.length > 0 && (
          <View style={[styles.metaRow, { paddingBottom: card ? 4 : 0 }]}>
            <Text
              style={{
                fontFamily: mono ? MONO : 'IBMPlexSansKR_400Regular',
                fontSize: mono ? 10.5 : 12.5,
                letterSpacing: mono ? emToTracking(0.12, 10.5) : emToTracking(0.01, 12.5),
                color: theme.sub,
              }}
            >
              {loading ? '검색 중...' : txt.hits(hits.length)}
            </Text>
            <Text
              style={{
                fontFamily: mono ? MONO : 'IBMPlexSansKR_400Regular',
                fontSize: mono ? 10.5 : 12.5,
                letterSpacing: mono ? emToTracking(0.12, 10.5) : emToTracking(0.01, 12.5),
                color: theme.sub,
              }}
            >
              관련순
            </Text>
          </View>
        )}
      </View>

      {chips.length === 0 ? (
        <View style={{ marginTop: 28, paddingHorizontal: card ? 24 : 26 }}>
          <Text style={[styles.help, { color: theme.sub }]}>띄어 쓰면 단어가 하나씩 묶여요.</Text>
          <Text style={[styles.help, { color: theme.sub }]}>단어를 누르면 제외, ×를 누르면 삭제.</Text>
        </View>
      ) : (
        <AsyncStateView
          theme={theme}
          loading={loading && hits.length === 0}
          error={error}
          onRetry={retry}
          empty={hits.length === 0}
          topOffset={28}
          emptyText={
            <View style={{ marginTop: 28, paddingHorizontal: card ? 24 : 26 }}>
              <Text style={[styles.help, { color: theme.sub }]}>결과가 없어요.</Text>
              <Text style={[styles.help, { color: theme.sub }]}>제외한 단어를 다시 눌러 풀어 보세요.</Text>
            </View>
          }
        >
          <FlatList
            data={rows}
            keyExtractor={(row) => row.key}
            renderItem={({ item: row }) =>
              row.kind === 'header' ? (
                <View style={styles.sectionHead}>
                  <Text style={[styles.sectionTitle, { color: theme.ink }]}>{row.title}</Text>
                  <Text style={[styles.sectionCount, { color: theme.sub }]}>{row.count}</Text>
                </View>
              ) : (
                <ResultRow
                  item={row.hit.result}
                  theme={theme}
                  tech={tech}
                  trashed={!!row.hit.raw.deleted_at}
                  onRestore={() => restore(row.hit.raw.id)}
                  onPress={
                    row.hit.raw.deleted_at ? undefined : () => navigation.navigate('ItemDetail', { item: row.hit.raw })
                  }
                />
              )
            }
            contentContainerStyle={{ paddingHorizontal: card ? 24 : 26, paddingTop: card ? 12 : 0, paddingBottom: 24 }}
            style={styles.list}
          />
        </AsyncStateView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  searchShadow: { shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 14, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  searchInput: { fontSize: 17, flex: 1, padding: 0 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 },
  help: { fontSize: 13.5, lineHeight: 22, fontFamily: 'IBMPlexSansKR_400Regular' },
  sectionHead: { flexDirection: 'row', alignItems: 'baseline', gap: 6, paddingTop: 18, paddingBottom: 8 },
  sectionTitle: { fontSize: 12.5, fontWeight: '500', fontFamily: 'IBMPlexSansKR_500Medium' },
  sectionCount: { fontSize: 12.5, fontFamily: 'IBMPlexSansKR_400Regular' },
  list: { flex: 1 },
});
