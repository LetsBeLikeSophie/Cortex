// Ported from the Claude Design handoff (`project/Cortex Themed.dc.html`, THEMES const).
// Five palettes that each carry more than color: list layout, heading font,
// tab shape, button radius, search-hit highlight style, and copy tone all
// switch together with the theme.

export type ThemeKey = 'paper' | 'ink' | 'neural' | 'sage' | 'blush';

export type ListStyle = 'line' | 'card';
export type HitStyle = 'marker' | 'underline' | 'chip';
export type CopyTone = 'plain' | 'tech';

export interface Theme {
  key: ThemeKey;
  label: string;
  note: string;

  bg: string;
  ink: string;
  sub: string;
  line: string;
  soft: string;
  accent: string;

  surface: string;
  surfaceEdge: string | null;
  ghost: string;
  ghostBar: string;

  headFamily: string;
  headWeight: '400' | '500' | '600' | '700';
  headSize: number;
  numSize: number;
  numTrackEm: number;

  cardRadius: number;
  btnRadius: number;
  list: ListStyle;
  dark: boolean;

  hitStyle: HitStyle;
  copy: CopyTone;
  pulse: boolean;
}

export const SERIF = 'InstrumentSerif_400Regular';
export const GROTESK_SEMIBOLD = 'SchibstedGrotesk_600SemiBold';
export const GROTESK_BOLD = 'SchibstedGrotesk_700Bold';
export const MONO = 'IBMPlexMono_400Regular';
export const BODY_KR = 'IBMPlexSansKR_400Regular';
export const BODY_KR_MEDIUM = 'IBMPlexSansKR_500Medium';

export const THEMES: Record<ThemeKey, Theme> = {
  paper: {
    key: 'paper',
    label: 'Paper',
    note: '기본 테마 · 종이빛 크림 + 점토색, 세리프 표제',
    bg: '#fbfaf7', ink: '#14140f', sub: '#6a675e',
    line: '#e4e0d6', soft: '#eeebe2', accent: '#8d5c41',
    surface: 'transparent', surfaceEdge: null, ghost: '#e8e4d9', ghostBar: '#dcd8cd',
    headFamily: SERIF, headWeight: '400', headSize: 38, numSize: 78, numTrackEm: -0.035,
    cardRadius: 0, btnRadius: 999, list: 'line', dark: false,
    hitStyle: 'marker', copy: 'plain', pulse: false,
  },
  ink: {
    key: 'ink',
    label: 'Ink',
    note: '어두운 테마 · 잉크 블랙 + 앰버, 세리프 표제 유지',
    bg: '#151417', ink: '#f2efe9', sub: '#a6a29a',
    line: '#2a2930', soft: '#232228', accent: '#d99a6c',
    surface: '#1c1b20', surfaceEdge: '#272630', ghost: '#242329', ghostBar: '#2d2c34',
    headFamily: SERIF, headWeight: '400', headSize: 38, numSize: 78, numTrackEm: -0.035,
    cardRadius: 0, btnRadius: 999, list: 'line', dark: true,
    hitStyle: 'marker', copy: 'plain', pulse: false,
  },
  neural: {
    key: 'neural',
    label: 'Neural',
    note: '미래적 다크 · 그래파이트 + 아이스 라벤더, 카드 리스트',
    bg: '#14171c', ink: '#eef1f5', sub: '#9aa6b6',
    line: '#22272e', soft: '#1b1f26', accent: '#a8b4ff',
    surface: '#191d23', surfaceEdge: '#22272e', ghost: '#202631', ghostBar: '#2a3038',
    headFamily: GROTESK_SEMIBOLD, headWeight: '600', headSize: 27, numSize: 58, numTrackEm: -0.045,
    cardRadius: 18, btnRadius: 14, list: 'card', dark: true,
    hitStyle: 'underline', copy: 'tech', pulse: true,
  },
  sage: {
    key: 'sage',
    label: 'Sage',
    note: '밝은 세이지 · 흰 카드 레이어, 큰 알약 버튼',
    bg: '#f4f2ec', ink: '#23251f', sub: '#5f6159',
    line: '#ddd9cf', soft: '#ffffff', accent: '#4f7360',
    surface: '#ffffff', surfaceEdge: null, ghost: '#e4e0d6', ghostBar: '#dcd8cf',
    headFamily: GROTESK_BOLD, headWeight: '700', headSize: 26, numSize: 54, numTrackEm: -0.04,
    cardRadius: 20, btnRadius: 999, list: 'card', dark: false,
    hitStyle: 'chip', copy: 'plain', pulse: false,
  },
  blush: {
    key: 'blush',
    label: 'Blush',
    note: '따뜻한 로즈 · 세리프 표제 + 카드 리스트 혼합',
    bg: '#fbf6f4', ink: '#241c1b', sub: '#6d5b58',
    line: '#e8dad6', soft: '#ffffff', accent: '#b0524a',
    surface: '#ffffff', surfaceEdge: null, ghost: '#eadfdb', ghostBar: '#e0d1cd',
    headFamily: SERIF, headWeight: '400', headSize: 36, numSize: 70, numTrackEm: -0.035,
    cardRadius: 16, btnRadius: 999, list: 'card', dark: false,
    hitStyle: 'marker', copy: 'plain', pulse: false,
  },
};

export const THEME_ORDER: ThemeKey[] = ['paper', 'ink', 'neural', 'sage', 'blush'];

/** em → RN letterSpacing (points), which is relative to the given font size. */
export function emToTracking(em: number, fontSize: number): number {
  return Math.round(em * fontSize * 100) / 100;
}
