import type { ApiItem, ItemSource } from './client';
import type { RecentItem, SearchResult } from '../data/content';

const SOURCE_LABEL: Record<ItemSource, string> = {
  instagram: '인스타그램',
  kakaotalk: '카카오톡',
  safari: '사파리',
  youtube: '유튜브',
  memo: '메모',
  other: '기타',
};

// Fixed display order for anything that lists all sources (e.g. the stats
// screen), so a chart's legend/bars don't reshuffle between renders.
export const SOURCE_ORDER = Object.keys(SOURCE_LABEL) as ItemSource[];

export function sourceLabel(source: ItemSource, tech: boolean): string {
  return tech ? source.toUpperCase() : SOURCE_LABEL[source];
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

function metaFor(item: ApiItem) {
  return {
    metaPlain: `${sourceLabel(item.source, false)} · ${relativeTime(item.shared_at)}`,
    metaTech: `${sourceLabel(item.source, true)} · ${relativeTime(item.shared_at)}`,
  };
}

export function toRecentItem(item: ApiItem, index: number): RecentItem {
  return {
    no: String(index + 1).padStart(2, '0'),
    title: item.title ?? item.raw_text?.slice(0, 40) ?? '(제목 없음)',
    ...metaFor(item),
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
    ...metaFor(item),
  };
}
