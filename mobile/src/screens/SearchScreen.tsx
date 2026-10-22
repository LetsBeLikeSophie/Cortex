import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Keyboard, Pressable, StyleSheet, Text, TextInput, View, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useTheme } from '../theme/ThemeContext';
import { MONO, OUTLINE, Theme, allEdges, bottomEdge, emToTracking } from '../theme/themes';
import { copyFor, SearchResult } from '../data/content';
import {
  askSearch,
  asQuotaError,
  QuotaError,
  fetchPlan,
  Plan,
  fetchTags,
  restoreItem,
  searchItems as apiSearchItems,
  smartSearch,
  ApiItem,
  SearchInterpretation,
  SmartSearchResponse,
  friendlyError,
} from '../api/client';
import { captureTypeLabel, sourceLabel, toSearchResult, toSmartSearchResult } from '../api/format';
import { ResultRow } from '../components/ListItems';
import { AsyncStateView } from '../components/AsyncStateView';
import { Heading } from '../components/Typography';
import { ChipQueryRow, SearchChip } from '../components/Chips';
import { HashIcon, SearchIcon, SparkleIcon } from '../components/Icons';
import { fieldStyle } from '../components/Fields';
import { VoiceInputButton } from '../components/VoiceInputButton';
import { LayeredBack, VintageWallpaper } from '../components/Decor';
import { useChipQuery } from '../hooks/useChipQuery';
import { looksLikeSentenceWord } from '../data/sentenceDetect';
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
  const nothingRead =
    q.keywords.length === 0 && q.exclude.length === 0 && !q.source && !q.captureType && !q.category && !q.dateFrom && !q.dateTo && !q.sort;
  // The AI found no condition in the sentence -- say so, instead of an empty
  // chip row above a list that seems to come from nowhere.
  if (nothingRead) {
    return <Text style={[styles.noReading, { color: theme.sub }]}>찾을 조건을 못 읽었어요 · 최근에 저장한 순서로 보여줘요</Text>;
  }
  return (
    <View style={styles.chipRow}>
      {q.sort && (
        <SearchChip
          label={`순서 · ${q.sort === 'oldest' ? '오래된 순' : '최신 순'}`}
          excluded={false}
          theme={theme}
          onToggle={noop}
          onRemove={() => onChange({ ...q, sort: null })}
        />
      )}
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
          // "+3" read as a count of results; "외 3" says it's 3 more words.
          label={k.synonyms.length ? `${k.term} 외 ${k.synonyms.length}` : k.term}
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

// The search bar's own shell, per layout -- the same family as Home's hero
// box (heroShellStyle): an underline for the line layouts, a bordered box
// for thinBorder, and for layered/vintage an opaque front box that sits on
// a LayeredBack sliver (rendered as a sibling in the JSX below).
function searchShellStyle(theme: Theme): ViewStyle {
  const box = { borderRadius: theme.cardRadius, paddingHorizontal: 12, paddingVertical: 10 };
  switch (theme.list) {
    case 'line':
      return { ...bottomEdge(1.5, theme.ink), paddingBottom: 12 };
    case 'layered':
      return { ...box, ...allEdges(0, 'transparent'), backgroundColor: theme.cardBg };
    case 'bordered':
      return { ...box, backgroundColor: theme.surface, ...allEdges(OUTLINE, theme.line) };
  }
}

const LAYERED_BACK_OFFSET: ViewStyle = { position: 'absolute', top: 6, left: 6, right: -6, bottom: -6 };

const NO_FILTERS = { source: null, captureType: null, category: null, dateFrom: null, dateTo: null } as const;

export default function SearchScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  // Any boxed-away-from-the-edge layout -- same outer spacing rule Home uses.
  const boxed = theme.list !== 'line';
  const txt = copyFor();

  // One box. Typing searches instantly (no AI, nothing metered); Enter only
  // closes the keyboard. ✦ (or the mic) sends what's typed to the AI search.
  // A "-word" excludes it. Tag include/exclude chips live one layer down,
  // under "# 태그로 좁히기", for when the plain box isn't enough.
  const [query, setQuery] = useState('');
  const tags = useChipQuery();
  const [filterOpen, setFilterOpen] = useState(false);

  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // AI search state: the text the AI results belong to (typing anything else
  // drops back to instant search), its reading of it, and how many hits
  // dropping its filters would give.
  const [aiQuery, setAiQuery] = useState<string | null>(null);
  const [interpretation, setInterpretation] = useState<SearchInterpretation | null>(null);
  const [relaxedCount, setRelaxedCount] = useState<number | null>(null);
  const [asking, setAsking] = useState(false);
  // This month's AI searches are used up (402 from /items/search/ask).
  const [quotaHit, setQuotaHit] = useState<QuotaError | null>(null);
  // The AI search for `failedQuery` failed (not a quota stop). Shown above
  // the word-search results that took its place, until the text changes.
  const [aiError, setAiError] = useState<{ query: string; message: string } | null>(null);
  const [quotaQuery, setQuotaQuery] = useState<string | null>(null);
  // Every saved tag, for the tag filter's autocomplete -- refreshed on focus
  // so tags added elsewhere show up without a restart.
  const [allTags, setAllTags] = useState<string[]>([]);
  // AI searches left this month -- shown before ✦ is pressed and after.
  const [plan, setPlan] = useState<Plan | null>(null);
  const refreshPlan = React.useCallback(() => {
    fetchPlan()
      .then(setPlan)
      .catch(() => {});
  }, []);
  useFocusEffect(
    React.useCallback(() => {
      fetchTags()
        .then((res) => setAllTags(res.tags))
        .catch(() => {});
      refreshPlan();
    }, [refreshPlan]),
  );
  const aiLeft = plan ? Math.max(0, plan.search.limit - plan.search.used) : null;

  const trimmed = query.trim();
  const aiMode = aiQuery !== null && aiQuery === trimmed;

  // Instant search terms: typed words ("-word" = exclude) plus tag chips.
  const words = trimmed ? trimmed.split(/\s+/) : [];
  const isExcl = (w: string) => w.startsWith('-') && w.length > 1;
  const include = words.filter((w) => !isExcl(w)).concat(tags.includeChips.map((c) => c.text));
  const exclude = words.filter(isExcl).map((w) => w.slice(1)).concat(tags.excludeChips.map((c) => c.text));
  const termsKey = JSON.stringify([include, exclude]);

  const runSearch = React.useCallback((inc: string[], exc: string[]) => {
    setLoading(true);
    apiSearchItems(inc, exc)
      .then((res) => {
        const next = res.items
          .map((raw) => ({ raw, result: toSearchResult(raw, inc) }))
          .sort((a, b) => b.result.matchedCount - a.result.matchedCount);
        setHits(next);
        setError(null);
      })
      .catch((err) => {
        setHits([]);
        setError(friendlyError(err));
      })
      .finally(() => setLoading(false));
  }, []);

  // Instant search, debounced -- skipped while showing AI results for the
  // exact text in the box.
  useEffect(() => {
    if (aiMode) return;
    setInterpretation(null);
    setRelaxedCount(null);
    if (include.length === 0 && exclude.length === 0) {
      setHits([]);
      setError(null);
      return;
    }
    const timer = setTimeout(() => runSearch(include, exclude), 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [termsKey, aiMode]);

  const applySmart = (res: SmartSearchResponse, q: SearchInterpretation) => {
    // Server order: the asked-for date order, else score-then-newest.
    setHits(res.items.map((raw) => ({ raw, result: toSmartSearchResult(raw, q.keywords) })));
    setRelaxedCount(res.relaxed_count);
    setError(null);
  };

  const ask = (spoken?: string) => {
    const text = (spoken ?? query).trim();
    if (!text || asking) return;
    Keyboard.dismiss();
    setAiQuery(text);
    setAsking(true);
    setLoading(true);
    setQuotaHit(null);
    setAiError(null);
    askSearch(text)
      .then((res) => {
        setInterpretation(res.interpretation);
        applySmart(res, res.interpretation);
        refreshPlan();
      })
      .catch((err) => {
        // Falls back to word search for the same text -- and says so,
        // instead of the word results silently standing in for the AI's.
        setAiQuery(null);
        setInterpretation(null);
        const quota = asQuotaError(err);
        if (quota) {
          setQuotaHit(quota);
          setQuotaQuery(text);
        } else {
          setAiError({ query: text, message: friendlyError(err) });
        }
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
        setError(friendlyError(err));
      })
      .finally(() => setLoading(false));
  };

  const retry = () => {
    if (aiMode) {
      if (interpretation) reSearch(interpretation);
      else ask();
    } else {
      runSearch(include, exclude);
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

  // 모두/일부 포함 split: the typed words + tag chips for instant search,
  // the interpreted keyword groups for AI search. An explicit date order
  // from the AI is shown as is, without the split.
  const termCount = aiMode ? (interpretation?.sort ? 0 : interpretation?.keywords.length ?? 0) : include.length;
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

  const hasQuery = aiMode ? !!interpretation || asking : include.length + exclude.length > 0;
  // Reads like a sentence ("지난달에", "봤던") but is being searched word by
  // word -- point at ✦ rather than leave a thin result unexplained.
  const looksLikeSentence = !aiMode && words.some(looksLikeSentenceWord);

  // Tag filter autocomplete: saved tags containing what's typed there, minus
  // ones already chipped. A "-" prefix carries over to an excluded chip.
  const tagDraft = tags.draft.trim();
  const tagExcluded = tagDraft.startsWith('-') && tagDraft.length > 1;
  const tagNeedle = (tagExcluded ? tagDraft.slice(1) : tagDraft).toLowerCase();
  const suggestions = filterOpen
    ? allTags.filter((t) => (!tagNeedle || t.toLowerCase().includes(tagNeedle)) && !tags.chips.some((c) => c.text === t)).slice(0, 10)
    : [];
  const pickSuggestion = (tag: string) => {
    tags.addChip(tagExcluded ? `-${tag}` : tag);
    tags.setDraft('');
  };

  const metaStyle = {
    fontFamily: 'IBMPlexSansKR_400Regular',
    fontSize: 12.5,
    letterSpacing: emToTracking(0.01, 12.5),
    color: theme.sub,
  };
  const orderLabel = aiMode && interpretation?.sort ? (interpretation.sort === 'oldest' ? '오래된 순' : '최신 순') : '관련순';

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: theme.bg }]} edges={['top']}>
      <VintageWallpaper theme={theme} />
      <View style={{ paddingHorizontal: boxed ? 24 : 26, paddingTop: boxed ? 26 : 30 }}>
        <Heading theme={theme}>{txt.searchTitle}</Heading>

        <View style={{ marginTop: boxed ? 20 : 24 }}>
          {theme.list === 'layered' && <LayeredBack theme={theme} radius={theme.cardRadius} style={LAYERED_BACK_OFFSET} />}
          <View style={[styles.searchBox, searchShellStyle(theme)]}>
            <SearchIcon color={theme.sub} size={16} strokeWidth={1.4} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={() => Keyboard.dismiss()}
              returnKeyType="done"
              style={[styles.searchInput, { color: theme.ink, fontFamily: 'IBMPlexSansKR_400Regular', outlineWidth: 0 }]}
              selectionColor={theme.accent}
              placeholder="단어로 바로 찾기 · ✦는 문장으로"
              placeholderTextColor={theme.sub}
            />
            {/* The mic only types: what was said lands in the box and is
                searched like typing. AI search stays on ✦ alone, so a spoken
                search never spends the month's AI searches by itself. */}
            <VoiceInputButton theme={theme} size={16} onResult={(spoken) => setQuery(spoken)} />
            <Pressable
              onPress={() => ask()}
              disabled={!trimmed || asking || aiMode}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="AI로 찾기"
              style={[styles.aiButton, { opacity: trimmed && !aiMode ? 1 : 0.4 }]}
            >
              {asking ? <ActivityIndicator size="small" color={theme.accent} /> : <SparkleIcon color={theme.accent} size={17} strokeWidth={1.5} />}
            </Pressable>
          </View>
        </View>

        {/* Second layer: tag include/exclude. Collapsed, it still says how
            many tag conditions are on so a narrowed result isn't a mystery. */}
        <View style={styles.filterBar}>
          <Pressable onPress={() => setFilterOpen((v) => !v)} hitSlop={8} style={styles.filterToggle}>
            <HashIcon color={tags.chips.length ? theme.ink : theme.sub} size={13} strokeWidth={1.4} />
            <Text style={[styles.filterLabel, { color: tags.chips.length ? theme.ink : theme.sub }]}>
              {tags.chips.length ? `태그 조건 ${tags.chips.length}개` : '태그로 좁히기'} {filterOpen ? '▴' : '▾'}
            </Text>
          </Pressable>
          {tags.chips.length > 0 && (
            <Pressable onPress={tags.clearChips} hitSlop={8}>
              <Text style={[styles.filterLabel, { color: theme.sub }]}>지우기</Text>
            </Pressable>
          )}
        </View>
        {filterOpen && (
          <View style={styles.filterPanel}>
            <TextInput
              value={tags.draft}
              onChangeText={tags.setDraft}
              onSubmitEditing={tags.commitDraft}
              onKeyPress={tags.onKeyPress}
              blurOnSubmit={false}
              returnKeyType="done"
              placeholder="태그 입력 · -태그는 제외"
              placeholderTextColor={theme.sub}
              style={[styles.tagInput, fieldStyle(theme), { color: theme.ink, fontFamily: 'IBMPlexSansKR_400Regular', outlineWidth: 0 }]}
            />
            <ChipQueryRow chips={tags.chips} theme={theme} onToggle={tags.toggleChip} onRemove={tags.removeChip} />
            {suggestions.length > 0 && (
              <View style={styles.suggestRow}>
                {suggestions.map((tag) => (
                  <Pressable key={tag} onPress={() => pickSuggestion(tag)} style={[styles.suggestTag, { borderColor: theme.line }]}>
                    <Text style={{ fontSize: 12.5, color: theme.ink, fontFamily: 'IBMPlexSansKR_400Regular' }}>#{tag}</Text>
                  </Pressable>
                ))}
              </View>
            )}
            <Text style={[styles.filterHelp, { color: theme.sub }]}>태그를 누르면 제외로 바뀌어요. ×는 빼기.</Text>
          </View>
        )}

        {quotaHit && quotaQuery === trimmed && (
          <View style={styles.notice}>
            <Text style={[styles.noticeText, { color: theme.ink }]}>이번 달 AI 검색 {quotaHit.limit}회를 다 썼어요. 단어로 찾은 결과예요.</Text>
            <Pressable onPress={() => navigation.navigate('Paywall', { reason: 'search' })} hitSlop={6}>
              <Text style={[styles.noticeLink, { color: theme.accent }]}>Pro 보기</Text>
            </Pressable>
          </View>
        )}
        {aiError && aiError.query === trimmed && (
          <View style={styles.notice}>
            <Text style={[styles.noticeText, { color: theme.danger }]}>AI 검색이 실패해서 단어로 찾은 결과예요.</Text>
            <Pressable onPress={() => ask()} hitSlop={6}>
              <Text style={[styles.noticeLink, { color: theme.ink }]}>다시 시도</Text>
            </Pressable>
          </View>
        )}

        {aiMode && interpretation && (
          <>
            <InterpretationRow q={interpretation} theme={theme} onChange={reSearch} />
            {/* Tapping a chip flips it to excluded -- say so, and that editing
                these never spends another AI search. */}
            <Text style={[styles.interpretHelp, { color: theme.sub }]}>
              AI가 읽은 조건 · 단어를 누르면 제외, ×는 빼기 (다시 AI를 쓰지 않아요)
            </Text>
          </>
        )}

        {looksLikeSentence && (
          <Pressable onPress={() => ask()} hitSlop={6} style={styles.suggestLine}>
            <SparkleIcon color={theme.accent} size={13} strokeWidth={1.4} />
            <Text style={{ fontSize: 13, color: theme.sub, fontFamily: 'IBMPlexSansKR_400Regular' }}>
              문장처럼 보여요 → <Text style={{ color: theme.accent, fontFamily: 'IBMPlexSansKR_500Medium' }}>AI로 찾기</Text>
            </Text>
          </Pressable>
        )}

        {hasQuery && (
          <View style={[styles.metaRow, { paddingBottom: boxed ? 4 : 0 }]}>
            <Text style={metaStyle}>{asking ? 'AI가 문장을 읽는 중...' : loading ? '검색 중...' : txt.hits(hits.length)}</Text>
            <Text style={metaStyle}>
              {aiMode ? `✦ ${orderLabel} · 1회 사용${aiLeft !== null ? ` · ${aiLeft}회 남음` : ''}` : orderLabel}
            </Text>
          </View>
        )}
      </View>

      {!hasQuery ? (
        <View style={{ marginTop: 28, paddingHorizontal: boxed ? 24 : 26 }}>
          <Text style={[styles.help, { color: theme.sub }]}>단어를 치는 대로 바로 찾아요. 앞에 -를 붙이면 빼고 찾아요.</Text>
          <Text style={[styles.help, { color: theme.sub }]}>기억이 흐릿하면 문장으로 쓰고 ✦를 눌러 보세요.</Text>
          <Text style={[styles.help, { color: theme.sub }]}>예: 지난달 인스타에서 본 성수 카페</Text>
          {aiLeft !== null && <Text style={[styles.help, { color: theme.sub }]}>AI 검색은 이번 달 {aiLeft}회 남았어요.</Text>}
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
            <View style={{ marginTop: 28, paddingHorizontal: boxed ? 24 : 26 }}>
              <Text style={[styles.help, { color: theme.sub }]}>결과가 없어요.</Text>
              {aiMode && interpretation && relaxedCount ? (
                <Pressable onPress={() => reSearch({ ...interpretation, ...NO_FILTERS })} hitSlop={6}>
                  <Text style={[styles.help, { color: theme.accent }]}>
                    기간·출처 같은 조건을 빼면 {relaxedCount}건 있어요. 조건 빼고 보기
                  </Text>
                </Pressable>
              ) : (
                <Text style={[styles.help, { color: theme.sub }]}>
                  {aiMode ? '위 조건을 ×로 지워 보세요.' : '기억나는 대로 문장으로 쓰고 ✦를 눌러 보세요.'}
                </Text>
              )}
            </View>
          }
        >
          <FlatList
            removeClippedSubviews={false}
            keyboardShouldPersistTaps="handled"
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
                  trashed={!!row.hit.raw.deleted_at}
                  onRestore={() => restore(row.hit.raw.id)}
                  onPress={row.hit.raw.deleted_at ? undefined : () => navigation.navigate('ItemDetail', { item: row.hit.raw })}
                />
              )
            }
            contentContainerStyle={{ paddingHorizontal: boxed ? 24 : 26, paddingTop: boxed ? 12 : 0, paddingBottom: 24 }}
            style={styles.list}
          />
        </AsyncStateView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  notice: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 12 },
  noticeText: { flex: 1, fontSize: 12.5, lineHeight: 18, fontFamily: 'IBMPlexSansKR_400Regular' },
  noticeLink: { fontSize: 12.5, fontFamily: 'IBMPlexSansKR_500Medium', textDecorationLine: 'underline' },
  interpretHelp: { fontSize: 12, marginTop: 8, fontFamily: 'IBMPlexSansKR_400Regular' },
  noReading: { fontSize: 12.5, marginTop: 12, fontFamily: 'IBMPlexSansKR_400Regular' },
  screen: { flex: 1 },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  searchInput: { fontSize: 17, flex: 1, padding: 0 },
  aiButton: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  filterBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 },
  filterToggle: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  filterLabel: { fontSize: 12.5, fontFamily: 'IBMPlexSansKR_400Regular' },
  filterPanel: { marginTop: 10 },
  tagInput: { fontSize: 14, paddingHorizontal: 12, paddingVertical: 9 },
  filterHelp: { fontSize: 12, marginTop: 8, fontFamily: 'IBMPlexSansKR_400Regular' },
  suggestLine: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
  suggestRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  suggestTag: { borderWidth: 1, borderStyle: 'dashed', borderRadius: 999, paddingHorizontal: 11, paddingVertical: 5 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 },
  help: { fontSize: 13.5, lineHeight: 22, fontFamily: 'IBMPlexSansKR_400Regular' },
  quotaTitle: { fontSize: 15, marginBottom: 6, fontFamily: 'IBMPlexSansKR_500Medium' },
  quotaActions: { flexDirection: 'row', gap: 20, marginTop: 12 },
  quotaLink: { fontSize: 14, fontFamily: 'IBMPlexSansKR_500Medium' },
  sectionHead: { flexDirection: 'row', alignItems: 'baseline', gap: 6, paddingTop: 18, paddingBottom: 8 },
  sectionTitle: { fontSize: 12.5, fontWeight: '500', fontFamily: 'IBMPlexSansKR_500Medium' },
  sectionCount: { fontSize: 12.5, fontFamily: 'IBMPlexSansKR_400Regular' },
  list: { flex: 1 },
});
