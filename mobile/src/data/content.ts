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

export const RECENT_ITEMS: RecentItem[] = [
  { no: '01', title: '성수동 크로플 맛집 3곳 총정리', metaPlain: '인스타그램 · 10분 전', metaTech: 'INSTAGRAM · 10분 전' },
  { no: '02', title: '엄마가 보내준 김치찌개 레시피', metaPlain: '카카오톡 · 어제', metaTech: 'KAKAOTALK · 어제' },
  { no: '03', title: '제주 2박3일 뚜벅이 코스 후기', metaPlain: '사파리 · 3일 전', metaTech: 'SAFARI · 3일 전' },
  { no: '04', title: '작은 방 정리 수납 아이디어 12가지', metaPlain: '유튜브 · 지난주', metaTech: 'YOUTUBE · 지난주' },
];

export const SEARCH_RESULTS: SearchResult[] = [
  {
    before: '', hit: '제주', after: ' 2박3일 뚜벅이 코스 후기',
    snippet: '애월 카페거리 → 한담해변 산책로 순서로 돌면 편하다는 내용',
    metaPlain: '사파리 · 3일 전', metaTech: 'SAFARI · 3일 전',
  },
  {
    before: '', hit: '제주도', after: ' 갈치조림 맛집 지도 링크',
    snippet: '지혜가 보낸 링크 · 동문시장 근처 3곳 표시됨',
    metaPlain: '카카오톡 · 2주 전', metaTech: 'KAKAOTALK · 2주 전',
  },
  {
    before: '', hit: '제주', after: ' 흑돼지 골목 웨이팅 팁',
    snippet: '6시 전에 가면 바로 앉을 수 있다고',
    metaPlain: '인스타그램 · 1개월 전', metaTech: 'INSTAGRAM · 1개월 전',
  },
  {
    before: '', hit: '제주', after: ' 가면 꼭 사올 것',
    snippet: '한라봉 청, 오메기떡, 우도 땅콩 쿠키',
    metaPlain: '메모 · 2개월 전', metaTech: 'MEMO · 2개월 전',
  },
];

export const SAVED_ITEM = {
  source: 'INSTAGRAM',
  title: '성수동 크로플 맛집 3곳 총정리',
  author: '@seoul_bread',
  photos: 4,
  tags: ['맛집', '성수동', '디저트'],
};

export const DEFAULT_QUERY = '제주도 맛집';
export const DEFAULT_TOTAL_SAVED = 342;

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
