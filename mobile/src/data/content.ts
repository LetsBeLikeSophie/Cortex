import { CopyTone } from '../theme/themes';

export interface RecentItem {
  no: string;
  title: string;
  metaPlain: string;
  metaTech: string;
}

export interface SearchResult {
  before: string;
  hit: string;
  after: string;
  snippet: string;
  metaPlain: string;
  metaTech: string;
}

export const SAVED_ITEM = {
  source: 'INSTAGRAM',
  title: '성수동 크로플 맛집 3곳 총정리',
  author: '@seoul_bread',
  photos: 4,
  tags: ['맛집', '성수동', '디저트'],
};

export const DEFAULT_QUERY = '제주도 맛집';
// Copy tone: `tech` (Neural) leans on English/instrument-panel phrasing,
// `plain` (everyone else) reads as plain, low-barrier Korean.
export function copyFor(tone: CopyTone) {
  const tech = tone === 'tech';
  return {
    heroLabel: tech ? 'MEMORY INDEX' : '보관한 기억',
    heroSuffix: '개의 기억\n보관 중',
    heroFoot: tech ? 'LIVE · 방금 1건 추가' : '이번 주 +12건 · 방금 저장됨',
    searchTitle: tech ? '기억 불러오기' : '무엇을 찾고 계신가요',
    hits: (n: number) => (tech ? `${n} MATCHES · 0.08s` : `결과 ${n}건`),
    savedLabel: tech ? 'SAVED TO CORTEX' : '저장 완료',
    savedTitle: tech ? '기억에 저장했어요' : '잘 보관했어요',
    tagLabel: tech ? 'AUTO TAGS' : '자동으로 붙은 태그',
  };
}
