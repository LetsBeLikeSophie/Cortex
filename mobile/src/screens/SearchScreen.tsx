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
import { captureTypeLabel, composeMaterials, sourceLabel, toSearchResult, toSmartSearchResult } from '../api/format';
import { ResultRow } from '../components/ListItems';
import { AsyncStateView } from '../components/AsyncStateView';
import { Heading } from '../components/Typography';
import { ChipQueryRow, SearchChip } from '../components/Chips';
import { HashIcon, SearchIcon, SparkleIcon } from '../components/Icons';
import { fieldStyle } from '../components/Fields';
import { VoiceInputButton } from '../components/VoiceInputButton';
import { LayeredBack, VintageWallpaper } from '../components/Decor';
import { useChipQuery } from '../hooks/useChipQuery';
import { looksLikeSentence as looksLikeSentenceText } from '../data/sentenceDetect';
import type { RootStackParamList } from '../navigation/types';
import { strings } from '../i18n';
import { categoryLabel, COMMON } from '../i18n/common';

const S = strings({
  ko: {
    after: (d: string) => `${d} 이후`,
    before: (d: string) => `${d} 이전`,
    noReading: '찾을 조건을 못 읽었어요 · 최근에 저장한 순서로 보여줘요',
    sortChip: (order: string) => `순서 · ${order}`,
    dateChip: (range: string) => `기간 · ${range}`,
    sourceChip: (source: string) => `출처 · ${source}`,
    typeChip: (type: string) => `형태 · ${type}`,
    categoryChip: (category: string) => `분류 · ${category}`,
    synonyms: (term: string, n: number) => `${term} 외 ${n}`,
    oldest: '오래된 순',
    newest: '최신 순',
    relevance: '관련순',
    allMatch: '모두 포함',
    someMatch: '일부 포함',
    placeholder: '단어로 바로 찾기 · ✦는 문장으로',
    askAi: 'AI로 찾기',
    tagConditions: (n: number) => `태그 조건 ${n}개`,
    narrowByTag: '태그로 좁히기',
    clear: '지우기',
    tagPlaceholder: '태그 입력 · -태그는 제외',
    tagHelp: '태그를 누르면 제외로 바뀌어요. ×는 빼기.',
    quotaUsed: (limit: number) => `이번 달 AI 검색 ${limit}회를 다 썼어요. 단어로 찾은 결과예요.`,
    seePro: 'Pro 보기',
    aiFailed: 'AI 검색이 실패해서 단어로 찾은 결과예요.',
    interpretHelp: 'AI가 읽은 조건 · 단어를 누르면 제외, ×는 빼기 (다시 AI를 쓰지 않아요)',
    quotaOut: '이번 달 AI 검색을 다 썼어요',
    looksLikeSentence: '문장처럼 보여요 → ',
    costLeft: (n: number) => ` (1회 · ${n}회 남음)`,
    costOne: ' (1회)',
    aiReading: 'AI가 문장을 읽는 중...',
    searching: '검색 중...',
    tagFiltered: ' · 태그 조건 적용',
    usedOne: '1회 사용',
    left: (n: number) => `${n}회 남음`,
    compose: (tag: string) => `'${tag}' 모아서 만들기`,
    help1: '단어를 치는 대로 바로 찾아요. 앞에 -를 붙이면 빼고 찾아요.',
    help2: '기억이 흐릿하면 문장으로 쓰고 ✦를 눌러 보세요.',
    example: '예: 지난달 인스타에서 본 성수 카페',
    aiLeftMonth: (n: number) => `AI 검색은 이번 달 ${n}회 남았어요.`,
    noResults: '결과가 없어요.',
    relaxed: (n: number) => `기간·출처 같은 조건을 빼면 ${n}건 있어요. 조건 빼고 보기`,
    clearAbove: '위 조건을 ×로 지워 보세요.',
    trySentence: '기억나는 대로 문장으로 쓰고 ✦를 눌러 보세요.',
  },
  en: {
    after: (d: string) => `after ${d}`,
    before: (d: string) => `before ${d}`,
    noReading: "Couldn't read any conditions · showing newest first",
    sortChip: (order: string) => `Order · ${order}`,
    dateChip: (range: string) => `Date · ${range}`,
    sourceChip: (source: string) => `From · ${source}`,
    typeChip: (type: string) => `Type · ${type}`,
    categoryChip: (category: string) => `Category · ${category}`,
    synonyms: (term: string, n: number) => `${term} +${n} more`,
    oldest: 'Oldest',
    newest: 'Newest',
    relevance: 'Relevance',
    allMatch: 'All match',
    someMatch: 'Partial match',
    placeholder: 'Type words · ✦ for a sentence',
    askAi: 'Search with AI',
    tagConditions: (n: number) => (n === 1 ? '1 tag filter' : `${n} tag filters`),
    narrowByTag: 'Filter by tag',
    clear: 'Clear',
    tagPlaceholder: 'Add a tag · -tag to exclude',
    tagHelp: 'Tap a tag to exclude it. × removes it.',
    quotaUsed: (limit: number) => `You've used all ${limit} AI searches this month. Showing word results.`,
    seePro: 'See Pro',
    aiFailed: 'AI search failed. Showing word results.',
    interpretHelp: 'What the AI read · tap to exclude, × to remove (no extra AI use)',
    quotaOut: "You've used this month's AI searches",
    looksLikeSentence: 'Looks like a sentence → ',
    costLeft: (n: number) => ` (1 use · ${n} left)`,
    costOne: ' (1 use)',
    aiReading: 'AI is reading...',
    searching: 'Searching...',
    tagFiltered: ' · tag filter on',
    usedOne: '1 used',
    left: (n: number) => `${n} left`,
    compose: (tag: string) => `Combine '${tag}'`,
    help1: 'Results show up as you type. Put - before a word to exclude it.',
    help2: "Can't quite remember? Write a sentence and tap ✦.",
    example: 'e.g. that café I saw on Instagram last month',
    aiLeftMonth: (n: number) => `${n} AI searches left this month.`,
    noResults: 'No results.',
    relaxed: (n: number) => `${n} found without the date/source filters. Show them`,
    clearAbove: 'Try removing a condition above with ×.',
    trySentence: 'Write what you remember as a sentence and tap ✦.',
  },
  ja: {
    after: (d: string) => `${d}以降`,
    before: (d: string) => `${d}以前`,
    noReading: '条件を読み取れませんでした · 新しい順に表示します',
    sortChip: (order: string) => `並び · ${order}`,
    dateChip: (range: string) => `期間 · ${range}`,
    sourceChip: (source: string) => `出どころ · ${source}`,
    typeChip: (type: string) => `形式 · ${type}`,
    categoryChip: (category: string) => `分類 · ${category}`,
    synonyms: (term: string, n: number) => `${term} ほか${n}`,
    oldest: '古い順',
    newest: '新しい順',
    relevance: '関連順',
    allMatch: 'すべて含む',
    someMatch: '一部を含む',
    placeholder: '単語ですぐ検索 · ✦で文章検索',
    askAi: 'AIで検索',
    tagConditions: (n: number) => `タグ条件 ${n}件`,
    narrowByTag: 'タグで絞り込む',
    clear: 'クリア',
    tagPlaceholder: 'タグを入力 · -タグで除外',
    tagHelp: 'タグをタップで除外に切り替え。×で外します。',
    quotaUsed: (limit: number) => `今月のAI検索${limit}回を使い切りました。単語での検索結果です。`,
    seePro: 'Proを見る',
    aiFailed: 'AI検索に失敗したため、単語での検索結果です。',
    interpretHelp: 'AIが読んだ条件 · タップで除外、×で外す（AIは再使用しません）',
    quotaOut: '今月のAI検索を使い切りました',
    looksLikeSentence: '文章のようです → ',
    costLeft: (n: number) => `（1回 · 残り${n}回）`,
    costOne: '（1回）',
    aiReading: 'AIが文章を読んでいます...',
    searching: '検索中...',
    tagFiltered: ' · タグ条件あり',
    usedOne: '1回使用',
    left: (n: number) => `残り${n}回`,
    compose: (tag: string) => `「${tag}」をまとめて作る`,
    help1: '入力するとすぐ検索します。前に - を付けると除外します。',
    help2: 'うろ覚えなら、文章で書いて ✦ を押してみてください。',
    example: '例: 先月インスタで見た下北沢のカフェ',
    aiLeftMonth: (n: number) => `今月のAI検索は残り${n}回です。`,
    noResults: '結果がありません。',
    relaxed: (n: number) => `期間・出どころの条件を外すと${n}件あります。条件を外して見る`,
    clearAbove: '上の条件を × で外してみてください。',
    trySentence: '覚えていることを文章で書いて ✦ を押してみてください。',
  },
  'zh-Hans': {
    after: (d: string) => `${d} 之后`,
    before: (d: string) => `${d} 之前`,
    noReading: '没读出搜索条件 · 按最近保存显示',
    sortChip: (order: string) => `顺序 · ${order}`,
    dateChip: (range: string) => `时间 · ${range}`,
    sourceChip: (source: string) => `来源 · ${source}`,
    typeChip: (type: string) => `形式 · ${type}`,
    categoryChip: (category: string) => `分类 · ${category}`,
    synonyms: (term: string, n: number) => `${term} 等${n}个`,
    oldest: '最早',
    newest: '最新',
    relevance: '相关度',
    allMatch: '全部包含',
    someMatch: '部分包含',
    placeholder: '输入词语即搜 · ✦ 用句子搜',
    askAi: '用 AI 搜索',
    tagConditions: (n: number) => `${n} 个标签条件`,
    narrowByTag: '按标签筛选',
    clear: '清除',
    tagPlaceholder: '输入标签 · -标签 为排除',
    tagHelp: '点标签切换为排除，× 移除。',
    quotaUsed: (limit: number) => `本月 ${limit} 次 AI 搜索已用完。以下是按词语搜索的结果。`,
    seePro: '查看 Pro',
    aiFailed: 'AI 搜索失败，以下是按词语搜索的结果。',
    interpretHelp: 'AI 读出的条件 · 点击排除，× 移除（不会再用 AI）',
    quotaOut: '本月 AI 搜索已用完',
    looksLikeSentence: '像是一句话 → ',
    costLeft: (n: number) => `（1 次 · 剩 ${n} 次）`,
    costOne: '（1 次）',
    aiReading: 'AI 正在读句子...',
    searching: '搜索中...',
    tagFiltered: ' · 已按标签筛选',
    usedOne: '用了 1 次',
    left: (n: number) => `剩 ${n} 次`,
    compose: (tag: string) => `汇总生成「${tag}」`,
    help1: '边输入边搜索。词前加 - 可排除。',
    help2: '记不太清？用一句话描述，再点 ✦。',
    example: '例：上个月在 IG 看到的加东咖啡店',
    aiLeftMonth: (n: number) => `本月还剩 ${n} 次 AI 搜索。`,
    noResults: '没有结果。',
    relaxed: (n: number) => `去掉时间、来源等条件有 ${n} 条。去掉条件查看`,
    clearAbove: '试试用 × 去掉上面的条件。',
    trySentence: '把记得的内容写成一句话，再点 ✦。',
  },
  'zh-Hant': {
    after: (d: string) => `${d} 之後`,
    before: (d: string) => `${d} 之前`,
    noReading: '沒讀出搜尋條件 · 依最近儲存顯示',
    sortChip: (order: string) => `順序 · ${order}`,
    dateChip: (range: string) => `時間 · ${range}`,
    sourceChip: (source: string) => `來源 · ${source}`,
    typeChip: (type: string) => `形式 · ${type}`,
    categoryChip: (category: string) => `分類 · ${category}`,
    synonyms: (term: string, n: number) => `${term} 等${n}個`,
    oldest: '最舊',
    newest: '最新',
    relevance: '相關度',
    allMatch: '全部包含',
    someMatch: '部分包含',
    placeholder: '輸入詞語即搜 · ✦ 用句子搜',
    askAi: '用 AI 搜尋',
    tagConditions: (n: number) => `${n} 個標籤條件`,
    narrowByTag: '依標籤篩選',
    clear: '清除',
    tagPlaceholder: '輸入標籤 · -標籤 為排除',
    tagHelp: '點標籤切換為排除，× 移除。',
    quotaUsed: (limit: number) => `本月 ${limit} 次 AI 搜尋已用完。以下是依詞語搜尋的結果。`,
    seePro: '查看 Pro',
    aiFailed: 'AI 搜尋失敗，以下是依詞語搜尋的結果。',
    interpretHelp: 'AI 讀出的條件 · 點一下排除，× 移除（不會再用 AI）',
    quotaOut: '本月 AI 搜尋已用完',
    looksLikeSentence: '看起來像一句話 → ',
    costLeft: (n: number) => `（1 次 · 剩 ${n} 次）`,
    costOne: '（1 次）',
    aiReading: 'AI 正在讀句子...',
    searching: '搜尋中...',
    tagFiltered: ' · 已依標籤篩選',
    usedOne: '用了 1 次',
    left: (n: number) => `剩 ${n} 次`,
    compose: (tag: string) => `彙整生成「${tag}」`,
    help1: '邊輸入邊搜尋。詞前加 - 可排除。',
    help2: '記不太清楚？用一句話描述，再點 ✦。',
    example: '例：上個月在 IG 看到的赤峰街咖啡廳',
    aiLeftMonth: (n: number) => `本月還剩 ${n} 次 AI 搜尋。`,
    noResults: '沒有結果。',
    relaxed: (n: number) => `拿掉時間、來源等條件有 ${n} 筆。拿掉條件查看`,
    clearAbove: '試試用 × 拿掉上面的條件。',
    trySentence: '把記得的內容寫成一句話，再點 ✦。',
  },
});

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
  if (from) return S.after(shortDate(from));
  return S.before(shortDate(to!));
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
    return <Text style={[styles.noReading, { color: theme.sub }]}>{S.noReading}</Text>;
  }
  return (
    <View style={styles.chipRow}>
      {q.sort && (
        <SearchChip
          label={S.sortChip(q.sort === 'oldest' ? S.oldest : S.newest)}
          excluded={false}
          theme={theme}
          onToggle={noop}
          onRemove={() => onChange({ ...q, sort: null })}
        />
      )}
      {(q.dateFrom || q.dateTo) && (
        <SearchChip
          label={S.dateChip(dateRangeLabel(q.dateFrom, q.dateTo))}
          excluded={false}
          theme={theme}
          onToggle={noop}
          onRemove={() => onChange({ ...q, dateFrom: null, dateTo: null })}
        />
      )}
      {q.source && (
        <SearchChip
          label={S.sourceChip(sourceLabel(q.source, false))}
          excluded={false}
          theme={theme}
          onToggle={noop}
          onRemove={() => onChange({ ...q, source: null })}
        />
      )}
      {q.captureType && (
        <SearchChip
          label={S.typeChip(captureTypeLabel(q.captureType, false))}
          excluded={false}
          theme={theme}
          onToggle={noop}
          onRemove={() => onChange({ ...q, captureType: null })}
        />
      )}
      {q.keywords.map((k, i) => (
        <SearchChip
          key={'k' + i + k.term}
          // "+3" read as a count of results; "외 3" says it's 3 more words.
          label={k.synonyms.length ? S.synonyms(k.term, k.synonyms.length) : k.term}
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

  // Instant search terms: typed words ("-word" = exclude) match loosely
  // anywhere; tag chips match a tag exactly (decision S1: '이사' doesn't
  // bring in '이사님'). Included chips also ride along in `include` so an
  // older server (which ignores `tags`) still narrows and highlights.
  const words = trimmed ? trimmed.split(/\s+/) : [];
  const isExcl = (w: string) => w.startsWith('-') && w.length > 1;
  const chipTags = tags.includeChips.map((c) => c.text);
  const chipExcl = tags.excludeChips.map((c) => c.text);
  const include = words.filter((w) => !isExcl(w)).concat(chipTags);
  const exclude = words.filter(isExcl).map((w) => w.slice(1));
  const termsKey = JSON.stringify([include, exclude, chipTags, chipExcl]);

  const runSearch = React.useCallback((inc: string[], exc: string[], tagInc: string[], tagExc: string[]) => {
    setLoading(true);
    const hasTag = (raw: ApiItem, t: string) => [...raw.tags, ...raw.user_tags].some((x) => x.toLowerCase() === t.toLowerCase());
    apiSearchItems(inc, exc, 30, tagInc, tagExc)
      .then((res) => {
        const next = res.items
          .filter((raw) => tagInc.every((t) => hasTag(raw, t)) && !tagExc.some((t) => hasTag(raw, t)))
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
    if (include.length === 0 && exclude.length === 0 && chipExcl.length === 0) {
      setHits([]);
      setError(null);
      return;
    }
    const timer = setTimeout(() => runSearch(include, exclude, chipTags, chipExcl), 250);
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
      runSearch(include, exclude, chipTags, chipExcl);
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
  // AI results come back for the sentence alone -- the tag chips (set before
  // ✦ or changed after) narrow them here, without asking the AI again.
  const aiTagFiltered = aiMode && tags.includeChips.length + tags.excludeChips.length > 0;
  const shown = aiTagFiltered
    ? hits.filter((h) => {
        const has = new Set([...h.raw.tags, ...h.raw.user_tags]);
        return tags.includeChips.every((c) => has.has(c.text)) && !tags.excludeChips.some((c) => has.has(c.text));
      })
    : hits;
  // The search matches tag text loosely ('이사' also finds '이사님') and stops
  // at 30, so only exact-tag hits decide whether to offer 모아서 만들기; the
  // sheet then counts the tag itself (fetchItemsWithTag).
  const oneTag = tags.includeChips.length === 1 ? tags.includeChips[0].text : null;
  const searchMaterials = composeMaterials(shown.map((h) => h.raw).filter((it) => oneTag !== null && [...it.tags, ...it.user_tags].includes(oneTag)));

  const termCount = aiMode ? (interpretation?.sort ? 0 : interpretation?.keywords.length ?? 0) : include.length;
  const rows: Row[] = [];
  if (termCount > 1) {
    const all = shown.filter((h) => h.result.matchedCount === termCount);
    const some = shown.filter((h) => h.result.matchedCount < termCount);
    if (all.length) {
      rows.push({ kind: 'header', key: 'h-all', title: S.allMatch, count: all.length });
      all.forEach((hit, i) => rows.push({ kind: 'item', key: 'all' + i, hit }));
    }
    if (some.length) {
      rows.push({ kind: 'header', key: 'h-some', title: S.someMatch, count: some.length });
      some.forEach((hit, i) => rows.push({ kind: 'item', key: 'some' + i, hit }));
    }
  } else {
    shown.forEach((hit, i) => rows.push({ kind: 'item', key: 'row' + i, hit }));
  }

  const hasQuery = aiMode ? !!interpretation || asking : include.length + exclude.length > 0;
  // Reads like a sentence ("지난달에", "봤던") but is being searched word by
  // word -- point at ✦ rather than leave a thin result unexplained.
  const looksLikeSentence = !aiMode && looksLikeSentenceText(trimmed);

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
  const orderLabel = aiMode && interpretation?.sort ? (interpretation.sort === 'oldest' ? S.oldest : S.newest) : S.relevance;

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
              placeholder={S.placeholder}
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
              accessibilityLabel={S.askAi}
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
              {tags.chips.length ? S.tagConditions(tags.chips.length) : S.narrowByTag} {filterOpen ? '▴' : '▾'}
            </Text>
          </Pressable>
          {tags.chips.length > 0 && (
            <Pressable onPress={tags.clearChips} hitSlop={8}>
              <Text style={[styles.filterLabel, { color: theme.sub }]}>{S.clear}</Text>
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
              placeholder={S.tagPlaceholder}
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
            <Text style={[styles.filterHelp, { color: theme.sub }]}>{S.tagHelp}</Text>
          </View>
        )}

        {quotaHit && quotaQuery === trimmed && (
          <View style={styles.notice}>
            <Text style={[styles.noticeText, { color: theme.ink }]}>{S.quotaUsed(quotaHit.limit)}</Text>
            <Pressable onPress={() => navigation.navigate('Paywall', { reason: 'search' })} hitSlop={6}>
              <Text style={[styles.noticeLink, { color: theme.accent }]}>{S.seePro}</Text>
            </Pressable>
          </View>
        )}
        {aiError && aiError.query === trimmed && (
          <View style={styles.notice}>
            <Text style={[styles.noticeText, { color: theme.danger }]}>{S.aiFailed}</Text>
            <Pressable onPress={() => ask()} hitSlop={6}>
              <Text style={[styles.noticeLink, { color: theme.ink }]}>{COMMON.retry}</Text>
            </Pressable>
          </View>
        )}

        {aiMode && interpretation && (
          <>
            <InterpretationRow q={interpretation} theme={theme} onChange={reSearch} />
            {/* Tapping a chip flips it to excluded -- say so, and that editing
                these never spends another AI search. */}
            <Text style={[styles.interpretHelp, { color: theme.sub }]}>
              {S.interpretHelp}
            </Text>
          </>
        )}

        {/* Says what the tap costs; with none left it stops offering. */}
        {looksLikeSentence &&
          (aiLeft === 0 ? (
            <View style={styles.suggestLine}>
              <Text style={{ fontSize: 13, color: theme.sub, fontFamily: 'IBMPlexSansKR_400Regular' }}>{S.quotaOut}</Text>
            </View>
          ) : (
            <Pressable onPress={() => ask()} hitSlop={6} style={styles.suggestLine}>
              <SparkleIcon color={theme.accent} size={13} strokeWidth={1.4} />
              <Text style={{ fontSize: 13, color: theme.sub, fontFamily: 'IBMPlexSansKR_400Regular' }}>
                {S.looksLikeSentence}<Text style={{ color: theme.accent, fontFamily: 'IBMPlexSansKR_500Medium' }}>{S.askAi}</Text>
                {aiLeft !== null ? S.costLeft(aiLeft) : S.costOne}
              </Text>
            </Pressable>
          ))}

        {hasQuery && (
          <View style={[styles.metaRow, { paddingBottom: boxed ? 4 : 0 }]}>
            <Text style={metaStyle}>{asking ? S.aiReading : loading ? S.searching : txt.hits(shown.length) + (aiTagFiltered ? S.tagFiltered : '')}</Text>
            <Text style={metaStyle}>
              {aiMode ? `✦ ${orderLabel} · ${S.usedOne}${aiLeft !== null ? ` · ${S.left(aiLeft)}` : ''}` : orderLabel}
            </Text>
          </View>
        )}

        {/* Searching by one tag is 모아서 만들기's material already --
            offer it here too (decision Q8). */}
        {!aiMode && words.length === 0 && tags.includeChips.length === 1 && tags.excludeChips.length === 0 && searchMaterials.usable.length >= 2 && (
          <Pressable
            onPress={() => navigation.navigate('Compose', { tag: tags.includeChips[0].text })}
            hitSlop={6}
            style={styles.suggestLine}
          >
            <SparkleIcon color={theme.accent} size={13} strokeWidth={1.4} />
            <Text style={{ fontSize: 13, color: theme.accent, fontFamily: 'IBMPlexSansKR_500Medium' }}>{S.compose(tags.includeChips[0].text)}</Text>
          </Pressable>
        )}
      </View>

      {!hasQuery ? (
        <View style={{ marginTop: 28, paddingHorizontal: boxed ? 24 : 26 }}>
          <Text style={[styles.help, { color: theme.sub }]}>{S.help1}</Text>
          <Text style={[styles.help, { color: theme.sub }]}>{S.help2}</Text>
          <Text style={[styles.help, { color: theme.sub }]}>{S.example}</Text>
          {aiLeft !== null && <Text style={[styles.help, { color: theme.sub }]}>{S.aiLeftMonth(aiLeft)}</Text>}
        </View>
      ) : (
        <AsyncStateView
          theme={theme}
          loading={loading && shown.length === 0}
          error={error}
          onRetry={retry}
          empty={shown.length === 0}
          topOffset={28}
          emptyText={
            <View style={{ marginTop: 28, paddingHorizontal: boxed ? 24 : 26 }}>
              <Text style={[styles.help, { color: theme.sub }]}>{S.noResults}</Text>
              {aiMode && interpretation && relaxedCount ? (
                <Pressable onPress={() => reSearch({ ...interpretation, ...NO_FILTERS })} hitSlop={6}>
                  <Text style={[styles.help, { color: theme.accent }]}>
                    {S.relaxed(relaxedCount)}
                  </Text>
                </Pressable>
              ) : (
                <Text style={[styles.help, { color: theme.sub }]}>
                  {aiMode ? S.clearAbove : S.trySentence}
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
