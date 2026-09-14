import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '../theme/ThemeContext';
import { MONO, emToTracking } from '../theme/themes';
import { copyFor, DEFAULT_QUERY, SearchResult, SEARCH_RESULTS } from '../data/content';
import { searchItems as apiSearchItems } from '../api/client';
import { toSearchResult } from '../api/format';
import { ResultRow } from '../components/ListItems';
import { SearchIcon } from '../components/Icons';

export default function SearchScreen() {
  const { theme } = useTheme();
  const card = theme.list === 'card';
  const tech = theme.copy === 'tech';
  const mono = tech;
  const txt = copyFor(theme.copy);
  const [query, setQuery] = useState(DEFAULT_QUERY);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      return;
    }
    setLoading(true);
    const timer = setTimeout(() => {
      apiSearchItems(trimmed)
        .then((res) => setResults(res.items.map((item) => toSearchResult(item, trimmed))))
        // No backend reachable -- fall back to the design's demo results.
        .catch(() => setResults(SEARCH_RESULTS))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: theme.bg }]} edges={['top']}>
      <View style={{ paddingHorizontal: card ? 24 : 26, paddingTop: card ? 26 : 30 }}>
        <Text
          style={{
            fontFamily: theme.headFamily,
            fontWeight: theme.headWeight,
            fontSize: theme.headSize,
            lineHeight: theme.headSize * 1.1,
            letterSpacing: emToTracking(-0.02, theme.headSize),
            color: theme.ink,
          }}
        >
          {txt.searchTitle}
        </Text>

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
            value={query}
            onChangeText={setQuery}
            style={[styles.searchInput, { color: theme.ink, fontFamily: 'IBMPlexSansKR_400Regular' }]}
            selectionColor={theme.accent}
            placeholder={txt.searchTitle}
            placeholderTextColor={theme.sub}
          />
        </View>

        <View style={[styles.metaRow, { paddingBottom: card ? 4 : 0 }]}>
          <Text
            style={{
              fontFamily: mono ? MONO : 'IBMPlexSansKR_400Regular',
              fontSize: mono ? 10.5 : 12.5,
              letterSpacing: mono ? emToTracking(0.12, 10.5) : emToTracking(0.01, 12.5),
              color: theme.sub,
            }}
          >
            {loading ? '검색 중...' : txt.hits(results.length)}
          </Text>
          <Text
            style={{
              fontFamily: mono ? MONO : 'IBMPlexSansKR_400Regular',
              fontSize: mono ? 10.5 : 12.5,
              letterSpacing: mono ? emToTracking(0.12, 10.5) : emToTracking(0.01, 12.5),
              color: theme.sub,
            }}
          >
            최신순
          </Text>
        </View>
      </View>

      {loading && results.length === 0 ? (
        <ActivityIndicator color={theme.accent} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item, i) => item.hit + item.rest + i}
          renderItem={({ item }) => <ResultRow item={item} theme={theme} tech={tech} />}
          contentContainerStyle={{ paddingHorizontal: card ? 24 : 26, paddingTop: card ? 12 : 0, paddingBottom: 24 }}
          style={styles.list}
        />
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
  list: { flex: 1 },
});
