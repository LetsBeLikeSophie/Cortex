import type { ApiItem, ItemSource } from '../api/client';

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
}

export interface SearchResult {
  title: string;
  snippet: string;
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
export function copyFor() {
  return {
    heroLabel: '보관한 기억',
    heroSuffix: '개의 기억\n보관 중',
    // weekCount/lastSaved are real, derived from the fetched items.
    heroFoot: (weekCount: number, lastSaved: string | null) => {
      const base = `이번 주 +${weekCount}건`;
      return lastSaved ? `${base} · ${lastSaved} 저장됨` : base;
    },
    searchTitle: '검색',
    hits: (n: number) => `결과 ${n}건`,
    savedLabel: '저장 완료',
    savedTitle: '잘 보관했어요',
    tagLabel: '자동으로 붙은 태그',
  };
}
