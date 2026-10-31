import type { ApiItem, ItemSource } from '../api/client';
import { strings } from '../i18n';

export interface RecentItem {
  no: string;
  title: string;
  source: ItemSource;
  captureType: ApiItem['capture_type'];
  timeLabel: string;
  // Classification is still running server-side -- title above already
  // reads as "분석 중" in this case (see toRecentItem), this just lets
  // RecentRow show that as a muted/distinct style rather than a plain title.
  pending?: boolean;
  // Made by 모아서 만들기 -- marked with ✦ in lists.
  composed?: boolean;
  // Memo lock: marked with a lock icon, title only.
  locked?: boolean;
  // A 미분류 photo: its id, for a small preview (titles can't tell them apart).
  thumbId?: string;
}

export interface SearchResult {
  title: string;
  // Empty for a locked memo (title only).
  snippet: string;
  locked?: boolean;
  // Include terms to highlight wherever they literally appear in title/snippet.
  terms: string[];
  // How many of the search's include terms this item actually matched (across
  // title/snippet/raw text/tags/channel/method, not just the visible text) --
  // drives the 모두 포함/일부 포함 grouping and the sort order.
  matchedCount: number;
  missingTerms: string[];
  source: ItemSource;
  captureType: ApiItem['capture_type'];
  timeLabel: string;
  pending?: boolean;
}

export const DEFAULT_QUERY = '제주도 맛집';
// The app's fixed UI copy (there used to be a second, English
// "instrument panel" tone for a theme that no longer exists).
const S = strings({
  ko: {
    heroLabel: '보관한 기억',
    heroSuffix: '개의 기억\n보관 중',
    weekCount: (n: number) => `이번 주 +${n}건`,
    lastSaved: (when: string) => `${when} 저장됨`,
    searchTitle: '검색',
    hits: (n: number) => `결과 ${n}건`,
    savedLabel: '저장 완료',
    savedTitle: '잘 보관했어요',
    tagLabel: '자동으로 붙은 태그',
  },
  en: {
    heroLabel: 'Saved memories',
    heroSuffix: 'saved\nso far',
    weekCount: (n: number) => `+${n} this week`,
    lastSaved: (when: string) => `saved ${when}`,
    searchTitle: 'Search',
    hits: (n: number) => (n === 1 ? '1 result' : `${n} results`),
    savedLabel: 'Saved',
    savedTitle: 'Got it, saved',
    tagLabel: 'Auto tags',
  },
  ja: {
    heroLabel: '保管した記憶',
    heroSuffix: '件の記憶を\n保管中',
    weekCount: (n: number) => `今週 +${n}件`,
    lastSaved: (when: string) => `最終保存 ${when}`,
    searchTitle: '検索',
    hits: (n: number) => `${n}件`,
    savedLabel: '保存完了',
    savedTitle: '保管しました',
    tagLabel: '自動で付いたタグ',
  },
  'zh-Hans': {
    heroLabel: '收藏的记忆',
    heroSuffix: '条记忆\n收藏中',
    weekCount: (n: number) => `本周 +${n}条`,
    lastSaved: (when: string) => `${when}保存`,
    searchTitle: '搜索',
    hits: (n: number) => `${n}条结果`,
    savedLabel: '已保存',
    savedTitle: '收好了',
    tagLabel: '自动标签',
  },
  'zh-Hant': {
    heroLabel: '收藏的記憶',
    heroSuffix: '則記憶\n收藏中',
    weekCount: (n: number) => `本週 +${n}則`,
    lastSaved: (when: string) => `${when}儲存`,
    searchTitle: '搜尋',
    hits: (n: number) => `${n}筆結果`,
    savedLabel: '已儲存',
    savedTitle: '收好了',
    tagLabel: '自動標籤',
  },
});

export function copyFor() {
  return {
    heroLabel: S.heroLabel,
    heroSuffix: S.heroSuffix,
    // weekCount/lastSaved are real, derived from the fetched items.
    heroFoot: (weekCount: number, lastSaved: string | null) => {
      const base = S.weekCount(weekCount);
      return lastSaved ? `${base} · ${S.lastSaved(lastSaved)}` : base;
    },
    searchTitle: S.searchTitle,
    hits: S.hits,
    savedLabel: S.savedLabel,
    savedTitle: S.savedTitle,
    tagLabel: S.tagLabel,
  };
}
