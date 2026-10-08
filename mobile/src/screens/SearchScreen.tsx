import React, { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useTheme } from '../theme/ThemeContext';
import { MONO, Theme, emToTracking } from '../theme/themes';
import { copyFor, DEFAULT_QUERY, SearchResult } from '../data/content';
import {
  askSearch,
  restoreItem,
  searchItems as apiSearchItems,
  smartSearch,
  ApiItem,
  SearchInterpretation,
  SmartSearchResponse,
} from '../api/client';
import { captureTypeLabel, sourceLabel, toSearchResult, toSmartSearchResult } from '../api/format';
import { ResultRow } from '../components/ListItems';
import { AsyncStateView } from '../components/AsyncStateView';
import { Heading } from '../components/Typography';
import { ChipQueryRow, SearchChip } from '../components/Chips';
import { SearchIcon } from '../components/Icons';
import { useChipQuery } from '../hooks/useChipQuery';
import type { RootStackParamList } from '../navigation/types';

interface Hit {
  result: SearchResult;
  raw: ApiItem;
}

type Row = { kind: 'header'; key: string; title: string; count: number } | { kind: 'item'; key: string; hit: Hit };

// "2026-09-01" -> "9/1" (or "2025.9.1" outside the current year) -- the
// date filter chip only needs to be recognizable, not exact-format.
function shortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return y === new Date().getFullYear() ? `${m}/${d}` : `${y}.${m}.${d}`;
}

function dateRangeLabel(from: string | null, to: string | null): string {
  if (from && to) return from === to ? shortDate(from) : `${shortDate(from)} – ${shortDate(to)}`;
  if (from) return `${shortDate(from)} 이후`;
  return `${shortDate(to!)} 이전`;
}

// The LLM's reading of a search sentence, as the same toggle/× chips the
// keyword search uses -- filters show as "기간 · 9/1 – 9/30" (× only),
// keywords as "카페 +3" (synonym count), tap to flip into excluded. Every
// edit re-runs through smartSearch, never the LLM again.
function InterpretationRow({
  q,
  theme,
  onChange,
}: {
  q: SearchInterpretation;
  theme: Theme;
  onChange: (next: SearchInterpretation) => void;
}) {
  const noop = () => {};
  return (
    <View style={styles.chipRow}>
      {(q.dateFrom || q.dateTo) && (
        <SearchChip
          label={`기간 · ${dateRangeLabel(q.dateFrom, q.dateTo)}`}
          excluded={false}
          theme={theme}
          onToggle={noop}
          onRemove={() => onChange({ ...q, dateFrom: null, dateTo: null })}
        />
      )}
      {q.source && (
        <SearchChip
          label={`출처 · ${sourceLabel(q.source, false)}`}
          excluded={false}
          theme={theme}
          onToggle={noop}
          onRemove={() => onChange({ ...q, source: null })}
        />
      )}
      {q.captureType && (
        <SearchChip
          label={`형태 · ${captureTypeLabel(q.captureType, false)}`}
          excluded={false}
          theme={theme}
          onToggle={noop}
          onRemove={() => onChange({ ...q, captureType: null })}
        />
      )}
      {q.category && (
        <SearchChip
          label={`분류 · ${q.category}`}
          excluded={false}
          theme={theme}
          onToggle={noop}
          onRemove={() => onChange({ ...q, category: null })}
        />
      )}
      {q.keywords.map((k, i) => (
        <SearchChip
          key={'k' + i + k.term}
          label={k.synonyms.length ? `${k.term} +${k.synonyms.length}` : k.term}
          excluded={false}
          theme={theme}
          onToggle={() =>
            onChange({ ...q, keywords: q.keywords.filter((_, j) => j !== i), exclude: [...q.exclude, k.term] })
          }
          onRemove={() => onChange({ ...q, keywords: q.keywords.filter((_, j) => j !== i) })}
        />
      ))}
      {q.exclude.map((w, i) => (
        <SearchChip
          key={'x' + i + w}
          label={w}
          excluded
          theme={theme}
          onToggle={() =>
            onChange({ ...q, exclude: q.exclude.filter((_, j) => j !== i), keywords: [...q.keywords, { term: w, synonyms: [] }] })
          }
          onRemove={() => onChange({ ...q, exclude: q.exclude.filter((_, j) => j !== i) })}
        />
      ))}
    </View>
  );
}

const NO_FILTERS = { source: null, captureType: null, category: null, dateFrom: null, dateTo: null } as const;

export default function SearchScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const card = theme.list === 'card';
  const tech = theme.copy === 'tech';
  const mono = tech;
  const txt = copyFor(theme.copy);

  const {
    mode,
    toSentenceMode,
    toKeywordMode,
    chips,
    draft,
    includeChips,
    excludeChips,
    onChangeText,
    commitDraft,
    onKeyPress,
    toggleChip,
    removeChip,
  } = useChipQuery();
  const sentence = mode === 'sentence';
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Sentence mode only: the LLM's last reading of the sentence (null until
  // Enter is pressed), and how many hits dropping its filters would give.
  const [interpretation, setInterpretation] = useState<SearchInterpretation | null>(null);
  const [relaxedCount, setRelaxedCount] = useState<number | null>(null);
  const [asking, setAsking] = useState(false);

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

  const applySmart = (res: SmartSearchResponse, q: SearchInterpretation) => {
    // Server order is already score-then-newest.
    setHits(res.items.map((raw) => ({ raw, result: toSmartSearchResult(raw, q.keywords) })));
    setRelaxedCount(res.relaxed_count);
    setError(null);
  };

  const ask = () => {
    const query = draft.trim();
    if (!query) return;
    setAsking(true);
    setLoading(true);
    askSearch(query)
      .then((res) => {
        setInterpretation(res.interpretation);
        applySmart(res, res.interpretation);
      })
      .catch((err) => {
        setHits([]);
        setInterpretation(null);
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        setAsking(false);
        setLoading(false);
      });
  };

  const reSearch = (q: SearchInterpretation) => {
    setInterpretation(q);
    setLoading(true);
    smartSearch(q)
      .then((res) => applySmart(res, q))
      .catch((err) => {
        setHits([]);
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => setLoading(false));
  };

  // Searches the word still being typed too, not just chips already
  // committed by a space/Enter -- same include/exclude ("-word") parsing
  // useChipQuery's commit step uses, just applied live. Backend search is
  // already substring matching (see searchItems' matchesTerm), so a partial
  // word like "성수" finds "성수동" the same way a committed one would.
  // Keyword mode only -- a sentence costs an LLM call, so it waits for Enter.
  const draftTerm = draft.trim();
  const draftExcluded = draftTerm.startsWith('-') && draftTerm.length > 1;
  const draftText = draftExcluded ? draftTerm.slice(1) : draftTerm;

  useEffect(() => {
    if (sentence) return;
    setInterpretation(null);
    setRelaxedCount(null);
    if (chips.length === 0 && !draftText) {
      setHits([]);
      setError(null);
      return;
    }
    const timer = setTimeout(() => {
      const include = includeChips.map((c) => c.text).concat(!draftExcluded && draftText ? [draftText] : []);
      const exclude = excludeChips.map((c) => c.text).concat(draftExcluded && draftText ? [draftText] : []);
      runSearch(include, exclude);
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chips, draftText, draftExcluded, sentence]);

  // Clearing the sentence box clears its results too.
  useEffect(() => {
    if (sentence && !draftTerm) {
      setHits([]);
      setInterpretation(null);
      setRelaxedCount(null);
      setError(null);
    }
  }, [sentence, draftTerm]);

  const retry = () => {
    if (sentence) {
      if (interpretation) reSearch(interpretation);
      else ask();
    } else {
      runSearch(includeChips.map((c) => c.text), excludeChips.map((c) => c.text));
    }
  };

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

  // Same 모두/일부 포함 split for both modes -- what counts as "all" is the
  // committed include chips in keyword mode, the interpreted keyword groups
  // in sentence mode.
  const termCount = sentence ? interpretation?.keywords.length ?? 0 : includeChips.length;
  const rows: Row[] = [];
  if (termCount > 1) {
    const all = hits.filter((h) => h.result.matchedCount === termCount);
    const some = hits.filter((h) => h.result.matchedCount < termCount);
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

  const hasQuery = sentence ? !!interpretation || asking : chips.length > 0;
  const showModeToggle = sentence || chips.length > 0 || !!draftTerm;
  const metaStyle = {
    fontFamily: mono ? MONO : 'IBMPlexSansKR_400Regular',
    fontSize: mono ? 10.5 : 12.5,
    letterSpacing: mono ? emToTracking(0.12, 10.5) : emToTracking(0.01, 12.5),
    color: theme.sub,
  };

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
                }
              : { marginTop: 24, borderBottomWidth: 1.5, borderBottomColor: theme.ink, paddingBottom: 12 },
          ]}
        >
          <SearchIcon color={theme.accent} size={18} strokeWidth={1.4} />
          <TextInput
            value={draft}
            onChangeText={onChangeText}
            onSubmitEditing={sentence ? ask : commitDraft}
            onKeyPress={onKeyPress}
            blurOnSubmit={false}
            returnKeyType={sentence ? 'search' : 'done'}
            style={[styles.searchInput, { color: theme.ink, fontFamily: 'IBMPlexSansKR_400Regular', outlineWidth: 0 }]}
            selectionColor={theme.accent}
            placeholder={chips.length > 0 ? '' : DEFAULT_QUERY}
            placeholderTextColor={theme.sub}
          />
          {showModeToggle && (
            <Pressable
              onPress={sentence ? toKeywordMode : toSentenceMode}
              hitSlop={8}
              style={[
                styles.modePill,
                sentence
                  ? { backgroundColor: theme.accent + '1f', borderColor: theme.accent }
                  : { borderColor: theme.line },
              ]}
            >
              <Text
                style={{
                  fontSize: 11.5,
                  fontFamily: 'IBMPlexSansKR_500Medium',
                  color: sentence ? theme.accent : theme.sub,
                }}
              >
                {sentence ? '문장 검색' : '문장으로'}
              </Text>
            </Pressable>
          )}
        </View>

        {sentence ? (
          interpretation && <InterpretationRow q={interpretation} theme={theme} onChange={reSearch} />
        ) : (
          <ChipQueryRow chips={chips} theme={theme} onToggle={toggleChip} onRemove={removeChip} />
        )}

        {hasQuery && (
          <View style={[styles.metaRow, { paddingBottom: card ? 4 : 0 }]}>
            <Text style={metaStyle}>{asking ? '문장 뜻 푸는 중...' : loading ? '검색 중...' : txt.hits(hits.length)}</Text>
            <Text style={metaStyle}>관련순</Text>
          </View>
        )}
      </View>

      {!hasQuery ? (
        <View style={{ marginTop: 28, paddingHorizontal: card ? 24 : 26 }}>
          {sentence ? (
            <>
              <Text style={[styles.help, { color: theme.sub }]}>문장으로 찾고 있어요.</Text>
              <Text style={[styles.help, { color: theme.sub }]}>다 쓰고 검색(Enter)을 누르면 뜻을 풀어서 찾아요.</Text>
            </>
          ) : (
            <>
              <Text style={[styles.help, { color: theme.sub }]}>띄어 쓰면 단어가 하나씩 묶여요.</Text>
              <Text style={[styles.help, { color: theme.sub }]}>단어를 누르면 제외, ×를 누르면 삭제.</Text>
              <Text style={[styles.help, { color: theme.sub }]}>
                기억이 흐릿하면 문장으로 써도 돼요. 예) 지난달 인스타에서 본 카페
              </Text>
            </>
          )}
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
              {sentence && interpretation && relaxedCount ? (
                <Pressable onPress={() => reSearch({ ...interpretation, ...NO_FILTERS })} hitSlop={6}>
                  <Text style={[styles.help, { color: theme.accent }]}>
                    기간·출처 같은 조건을 빼면 {relaxedCount}건 있어요. 조건 빼고 보기
                  </Text>
                </Pressable>
              ) : (
                <Text style={[styles.help, { color: theme.sub }]}>
                  {sentence ? '위 조건을 ×로 지워 보세요.' : '제외한 단어를 다시 눌러 풀어 보세요.'}
                </Text>
              )}
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
  searchInput: { fontSize: 17, flex: 1, padding: 0 },
  modePill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 },
  help: { fontSize: 13.5, lineHeight: 22, fontFamily: 'IBMPlexSansKR_400Regular' },
  sectionHead: { flexDirection: 'row', alignItems: 'baseline', gap: 6, paddingTop: 18, paddingBottom: 8 },
  sectionTitle: { fontSize: 12.5, fontWeight: '500', fontFamily: 'IBMPlexSansKR_500Medium' },
  sectionCount: { fontSize: 12.5, fontFamily: 'IBMPlexSansKR_400Regular' },
  list: { flex: 1 },
});
