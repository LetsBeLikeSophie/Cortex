// Ported from the Claude Design handoff (`project/Cortex Themed.dc.html`, THEMES const),
// then split into two independent axes per product discussion: a palette only
// carries color (plus whether it's a light or dark set), and a layout carries
// everything else that used to travel bundled with one specific palette --
// list shape, heading font, button/card radius, search-hit style, copy tone.
// Recombining any layout with any palette should render correctly, since
// every component reads individual `theme.X` fields rather than switching on
// which named preset it came from.

// 'card' is retired (see the LAYOUTS comment below) but kept in the union
// since nothing currently reads it -- removing it outright would be a
// separate, unrelated cleanup. 'bordered' is thinBorder's plain 1px-border
// box; 'layered' is layered/layeredVintage's two-plain-Views-offset stack
// (no elevation either way -- see cardShellStyle in ListItems.tsx).
export type ListStyle = 'line' | 'card' | 'bordered' | 'layered';
export type HitStyle = 'marker' | 'underline' | 'chip';
export type CopyTone = 'plain' | 'tech';

export type LayoutKey = 'line' | 'lineTone' | 'thinBorder' | 'layered' | 'layeredVintage';
export type PaletteKey = 'paper' | 'ink' | 'neural' | 'sage' | 'blush';

export interface Layout {
  label: string;
  // Shown under the label in ThemePickerScreen's layout list -- same role
  // Palette.note already plays for colors.
  note: string;

  headFamily: string;
  headWeight: '400' | '500' | '600' | '700';
  headSize: number;
  numSize: number;
  numTrackEm: number;

  cardRadius: number;
  btnRadius: number;
  list: ListStyle;

  hitStyle: HitStyle;
  copy: CopyTone;
  pulse: boolean;
  // Extra decoration on top of the list style -- 'vintage' adds the faint
  // diagonal crosshatch wallpaper behind each screen and the quatrefoil
  // pattern on layered back cards (see components/Decor.tsx).
  decor: 'none' | 'vintage';
}

export interface Palette {
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

  // layered-list front/back fill -- a darker-than-page-bg (light palette)
  // or lighter-than-page-bg (dark palette) front card, and a second card
  // behind it, offset down-right, in a deepened accent rather than a
  // neutral gray so it pops instead of reading as a plain shadow. Same
  // formula the design-preview artifact used (cardBg: bg mixed 3.5%/7%
  // toward black/white; cardStack: accent darkened 20%/25%), just
  // precomputed here since RN has no color-mixing helper on hand.
  cardBg: string;
  cardStack: string;

  dark: boolean;
}

// What a screen actually renders with -- a layout and a palette merged
// together (see composeTheme below). No `key`/`label`/`note` here: those are
// picker-identity metadata, not render inputs, and nothing reads them outside
// ThemePickerScreen/ProfileScreen (which read LAYOUTS/PALETTES directly).
export type Theme = Omit<Layout, 'label' | 'note'> & Omit<Palette, 'label' | 'note'>;

export const SERIF = 'InstrumentSerif_400Regular';
export const GROTESK_SEMIBOLD = 'SchibstedGrotesk_600SemiBold';
export const GROTESK_BOLD = 'SchibstedGrotesk_700Bold';
export const MONO = 'IBMPlexMono_400Regular';
export const BODY_KR = 'IBMPlexSansKR_400Regular';
export const BODY_KR_MEDIUM = 'IBMPlexSansKR_500Medium';

// The old card layout (background + border + shadow per row, rounded
// corners) is gone for good -- Android's elevation shadow never rendered it
// reliably (shadow clipped round, content fill square; a
// transparent-background palette paired with it made that even worse)
// across several attempted fixes. These five replace it, worked out in a
// design-preview artifact first. thinBorder and layered/layeredVintage now
// render for real (cardShellStyle in ListItems.tsx, the hero box in
// HomeScreen.tsx) -- plain border or two-plain-Views-offset, no elevation
// either way. layered and layeredVintage share list: 'layered' (same safe
// stacking mechanism); layeredVintage adds decor: 'vintage' on top (the
// quatrefoil pattern on the back card, the faint grid wallpaper behind
// everything -- components/Decor.tsx). lineTone's underline tabs + per-tag analogous color are still
// pending too: the artifact's 3-fixed-category mockup doesn't map onto the
// real app's free-form user tags, so that one needs a tag-to-color scheme
// decided before it's worth wiring in.
export const LAYOUTS: Record<LayoutKey, Layout> = {
  line: {
    label: '라인',
    note: '지금 라이브로 떠 있는 스타일. 구분선만 쓰고 카드 배경·테두리·그림자 전부 없어요.',
    headFamily: SERIF, headWeight: '400', headSize: 38, numSize: 78, numTrackEm: -0.035,
    cardRadius: 0, btnRadius: 999, list: 'line',
    hitStyle: 'marker', copy: 'plain', pulse: false, decor: 'none',
  },
  lineTone: {
    label: '라인 (컬러)',
    note: '라인과 같은 구분선 구조에, 숫자는 세리프 대신 산세리프로, 검색 하이라이트는 마커 대신 밑줄로 바꿔요.',
    headFamily: BODY_KR_MEDIUM, headWeight: '500', headSize: 38, numSize: 70, numTrackEm: 0,
    cardRadius: 0, btnRadius: 999, list: 'line',
    hitStyle: 'underline', copy: 'plain', pulse: false, decor: 'none',
  },
  thinBorder: {
    label: '얇은 테두리',
    note: '둥근 모서리에 얇은 테두리를 두르는 카드 스타일이에요.',
    headFamily: SERIF, headWeight: '400', headSize: 38, numSize: 70, numTrackEm: -0.035,
    cardRadius: 16, btnRadius: 999, list: 'bordered',
    hitStyle: 'marker', copy: 'plain', pulse: false, decor: 'none',
  },
  layered: {
    label: '레이어 카드',
    note: '테두리 없이, 카드 뒤에 진한 색 카드를 한 장 더 깔아 우하단으로 살짝 밀어내는 스타일이에요.',
    headFamily: SERIF, headWeight: '400', headSize: 38, numSize: 70, numTrackEm: -0.035,
    cardRadius: 20, btnRadius: 999, list: 'layered',
    hitStyle: 'marker', copy: 'plain', pulse: false, decor: 'none',
  },
  layeredVintage: {
    label: '레이어 카드 (빈티지)',
    note: '레이어 카드와 같은 구조에, 뒤 카드엔 무늬를 얹고 화면 바탕엔 옅은 격자무늬를 깔아요.',
    headFamily: SERIF, headWeight: '400', headSize: 38, numSize: 70, numTrackEm: -0.035,
    cardRadius: 20, btnRadius: 999, list: 'layered',
    hitStyle: 'marker', copy: 'plain', pulse: false, decor: 'vintage',
  },
};

export const LAYOUT_ORDER: LayoutKey[] = ['line', 'lineTone', 'thinBorder', 'layered', 'layeredVintage'];

export const PALETTES: Record<PaletteKey, Palette> = {
  paper: {
    label: 'Paper', note: '종이빛 크림 + 점토색',
    bg: '#fbfaf7', ink: '#14140f', sub: '#6a675e',
    line: '#e4e0d6', soft: '#eeebe2', accent: '#8d5c41',
    // 'transparent' was fine as long as Paper could only ever pair with the
    // line layout (surface is never painted there -- see the `card ? ... :
    // 'transparent'` guard at every call site). Now that any palette can
    // pair with the card layout, this is a real background fill a card
    // actually renders with -- transparent + Android elevation is exactly
    // what produced the "shadow visible, content square/invisible" bug.
    surface: '#ffffff', surfaceEdge: null, ghost: '#e8e4d9', ghostBar: '#dcd8cd',
    cardBg: '#f2f1ee', cardStack: '#714a34',
    dark: false,
  },
  ink: {
    label: 'Ink', note: '어두운 잉크 블랙 + 앰버',
    bg: '#151417', ink: '#f2efe9', sub: '#a6a29a',
    line: '#2a2930', soft: '#232228', accent: '#d99a6c',
    surface: '#1c1b20', surfaceEdge: '#272630', ghost: '#242329', ghostBar: '#2d2c34',
    cardBg: '#252427', cardStack: '#a37451',
    dark: true,
  },
  neural: {
    label: 'Neural', note: '그래파이트 + 아이스 라벤더',
    bg: '#14171c', ink: '#eef1f5', sub: '#9aa6b6',
    line: '#22272e', soft: '#1b1f26', accent: '#a8b4ff',
    surface: '#191d23', surfaceEdge: '#22272e', ghost: '#202631', ghostBar: '#2a3038',
    cardBg: '#24272c', cardStack: '#7e87bf',
    dark: true,
  },
  sage: {
    label: 'Sage', note: '밝은 세이지 + 흰 카드',
    bg: '#f4f2ec', ink: '#23251f', sub: '#5f6159',
    line: '#ddd9cf', soft: '#ffffff', accent: '#4f7360',
    surface: '#ffffff', surfaceEdge: null, ghost: '#e4e0d6', ghostBar: '#dcd8cf',
    cardBg: '#eceae4', cardStack: '#3f5c4d',
    dark: false,
  },
  blush: {
    label: 'Blush', note: '따뜻한 로즈',
    bg: '#fbf6f4', ink: '#241c1b', sub: '#6d5b58',
    line: '#e8dad6', soft: '#ffffff', accent: '#b0524a',
    surface: '#ffffff', surfaceEdge: null, ghost: '#eadfdb', ghostBar: '#e0d1cd',
    cardBg: '#f2edec', cardStack: '#8d423b',
    dark: false,
  },
};

export const PALETTE_ORDER: PaletteKey[] = ['paper', 'ink', 'neural', 'sage', 'blush'];

export function composeTheme(layoutKey: LayoutKey, paletteKey: PaletteKey): Theme {
  const { label: _layoutLabel, note: _layoutNote, ...layout } = LAYOUTS[layoutKey];
  const { label: _paletteLabel, note: _paletteNote, ...palette } = PALETTES[paletteKey];
  return { ...layout, ...palette };
}

/** em → RN letterSpacing (points), which is relative to the given font size. */
export function emToTracking(em: number, fontSize: number): number {
  return Math.round(em * fontSize * 100) / 100;
}
