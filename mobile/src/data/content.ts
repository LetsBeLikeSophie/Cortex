import { CopyTone } from '../theme/themes';
import type { ApiItem, ItemSource } from '../api/client';

export interface RecentItem {
  no: string;
  title: string;
  source: ItemSource;
  captureType: ApiItem['capture_type'];
  timeLabel: string;
}

export interface SearchResult {
  before: string;
  hit: string;
  after: string;
  snippet: string;
  source: ItemSource;
  captureType: ApiItem['capture_type'];
  timeLabel: string;
}

export const DEFAULT_QUERY = '제주도 맛집';
// Copy tone: `tech` (Neural) leans on English/instrument-panel phrasing,
// `plain` (everyone else) reads as plain, low-barrier Korean.
export function copyFor(tone: CopyTone) {
  const tech = tone === 'tech';
  return {
    heroLabel: tech ? 'MEMORY INDEX' : '보관한 기억',
    heroSuffix: '개의 기억\n보관 중',
    // weekCount/lastSaved are real, derived from the fetched items -- this
    // used to be a hardcoded '이번 주 +12건 · 방금 저장됨' regardless of
    // what was actually saved.
    heroFoot: (weekCount: number, lastSaved: string | null) => {
      if (tech) return lastSaved ? `LIVE · ${lastSaved} 저장` : 'LIVE · 대기 중';
      const base = `이번 주 +${weekCount}건`;
      return lastSaved ? `${base} · ${lastSaved} 저장됨` : base;
    },
    searchTitle: tech ? '기억 불러오기' : '무엇을 찾고 계신가요',
    hits: (n: number) => (tech ? `${n} MATCHES · 0.08s` : `결과 ${n}건`),
    savedLabel: tech ? 'SAVED TO CORTEX' : '저장 완료',
    savedTitle: tech ? '기억에 저장했어요' : '잘 보관했어요',
    tagLabel: tech ? 'AUTO TAGS' : '자동으로 붙은 태그',
  };
}
