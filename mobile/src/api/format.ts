import type { ApiItem, ItemSource, SearchInterpretation, SmartHit } from './client';
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
  const pending = item.classification_status === 'pending';
  return {
    no: String(index + 1).padStart(2, '0'),
    title: item.title ?? item.raw_text?.slice(0, 40) ?? (pending ? '분석 중...' : '(제목 없음)'),
    source: item.source,
    captureType: item.capture_type,
    timeLabel: relativeTime(item.shared_at),
    pending,
  };
}

// Whether an include term actually matched this item -- mirrors the
// backend's own matchesTerm (searchItems already filtered by this, but the
// client needs to know *which* terms hit, per item, to group 모두 포함/일부
//포함 and to know what's missing for the "OO 없음" badge).
function fieldMatches(item: ApiItem, needle: string): boolean {
  const n = needle.toLowerCase();
  if (item.title?.toLowerCase().includes(n)) return true;
  if (item.snippet?.toLowerCase().includes(n)) return true;
  if (item.raw_text?.toLowerCase().includes(n)) return true;
  if (item.user_note?.toLowerCase().includes(n)) return true;
  if (item.tags.some((t) => t.toLowerCase().includes(n))) return true;
  if (item.user_tags.some((t) => t.toLowerCase().includes(n))) return true;
  if (sourceLabel(item.source, false).toLowerCase().includes(n)) return true;
  if (sourceLabel(item.source, true).toLowerCase().includes(n)) return true;
  if (captureTypeLabel(item.capture_type, false).toLowerCase().includes(n)) return true;
  if (captureTypeLabel(item.capture_type, true).toLowerCase().includes(n)) return true;
  return false;
}

// Sentence-search counterpart of toSearchResult -- a keyword "matches" if
// its term or any synonym does (same group rule as the server's
// searchItemsSmart), and every term+synonym is highlighted.
export function toSmartSearchResult(item: SmartHit, keywords: SearchInterpretation['keywords']): SearchResult {
  const pending = item.classification_status === 'pending';
  const missing = keywords.filter((k) => ![k.term, ...k.synonyms].some((w) => fieldMatches(item, w)));
  return {
    title: item.title ?? item.raw_text?.slice(0, 40) ?? (pending ? '분석 중...' : '(제목 없음)'),
    snippet: item.snippet ?? item.raw_text ?? '',
    terms: keywords.flatMap((k) => [k.term, ...k.synonyms]),
    matchedCount: keywords.length - missing.length,
    missingTerms: missing.map((k) => k.term),
    source: item.source,
    captureType: item.capture_type,
    timeLabel: relativeTime(item.shared_at),
    pending,
  };
}

export function toSearchResult(item: ApiItem, include: string[]): SearchResult {
  const got = include.filter((w) => fieldMatches(item, w));
  const pending = item.classification_status === 'pending';
  return {
    title: item.title ?? item.raw_text?.slice(0, 40) ?? (pending ? '분석 중...' : '(제목 없음)'),
    snippet: item.snippet ?? item.raw_text ?? '',
    terms: include,
    matchedCount: got.length,
    missingTerms: include.filter((w) => !got.includes(w)),
    source: item.source,
    captureType: item.capture_type,
    timeLabel: relativeTime(item.shared_at),
    pending,
  };
}
