import type { ApiItem, ItemSource } from './client';
import type { RecentItem, SearchResult } from '../data/content';
import { SOURCE_CATALOG, CAPTURE_TYPE_CATALOG, SOURCE_ORDER } from '../data/sourceCatalog';

// Re-exported so existing call sites (e.g. StatsScreen) don't need to know
// the labels moved into a shared catalog -- see sourceCatalog.ts, the single
// place channel/method labels and per-channel capabilities are defined.
export { SOURCE_ORDER };

export function sourceLabel(source: ItemSource, tech: boolean): string {
  return tech ? SOURCE_CATALOG[source].labelTech : SOURCE_CATALOG[source].label;
}

// The "method" half of an item's fixed classification (source is the
// "channel" half) -- how it was captured, independent of which app/site it
// came from (e.g. a KakaoTalk text share and a memo typed by hand are both
// capture_type 'text').
export function captureTypeLabel(captureType: ApiItem['capture_type'], tech: boolean): string {
  return tech ? CAPTURE_TYPE_CATALOG[captureType].labelTech : CAPTURE_TYPE_CATALOG[captureType].label;
}

export function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return '방금';
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days === 1) return '어제';
  if (days < 7) return `${days}일 전`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}주 전`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}개월 전`;
  return `${Math.floor(days / 365)}년 전`;
}

export function toRecentItem(item: ApiItem, index: number): RecentItem {
  return {
    no: String(index + 1).padStart(2, '0'),
    title: item.title ?? item.raw_text?.slice(0, 40) ?? '(제목 없음)',
    source: item.source,
    captureType: item.capture_type,
    timeLabel: relativeTime(item.shared_at),
  };
}

// Highlights the query wherever it appears in the title (case-insensitive).
// If the title itself doesn't contain it -- the match came from the
// snippet/tags instead -- the whole title renders unhighlighted.
export function toSearchResult(item: ApiItem, query: string): SearchResult {
  const title = item.title ?? item.raw_text?.slice(0, 40) ?? '(제목 없음)';
  const idx = query ? title.toLowerCase().indexOf(query.toLowerCase()) : -1;

  return {
    before: idx >= 0 ? title.slice(0, idx) : title,
    hit: idx >= 0 ? title.slice(idx, idx + query.length) : '',
    after: idx >= 0 ? title.slice(idx + query.length) : '',
    snippet: item.snippet ?? item.raw_text ?? '',
    source: item.source,
    captureType: item.capture_type,
    timeLabel: relativeTime(item.shared_at),
  };
}
