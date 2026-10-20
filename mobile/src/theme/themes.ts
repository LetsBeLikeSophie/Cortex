// Ported from the Claude Design handoff (`project/Cortex Themed.dc.html`, THEMES const),
// then split into two independent axes per product discussion: a palette only
// carries color (plus whether it's a light or dark set), and a layout carries
// everything else that used to travel bundled with one specific palette --
// list shape, heading font, button/card radius, search-hit style, copy tone.
// Recombining any layout with any palette should render correctly, since
// every component reads individual `theme.X` fields rather than switching on
// which named preset it came from.

// The old 'card' list style is gone (see the LAYOUTS comment below).
// 'bordered' is thinBorder's plain 1px-border
// box; 'layered' is layered/layeredVintage's two-plain-Views-offset stack
// (no elevation either way -- see cardShellStyle in ListItems.tsx).
export type ListStyle = 'line' | 'bordered' | 'layered';
export type HitStyle = 'marker' | 'underline' | 'chip';
export type CopyTone = 'plain' | 'tech';

export type LayoutKey = 'line' | 'thinBorder' | 'layered' | 'layeredVintage';
export type PaletteKey = 'paper' | 'ink' | 'neural' | 'sage' | 'blush';

export interface Layout {
  label: string;
  // Shown under the label in ThemePickerScreen's layout list -- same role
  // Palette.note already plays for colors.
  note: string;
  // The color this layout comes with: picking the layout switches to it,
  // so each theme has one clear identity out of the box (the color can
  // still be changed afterwards).
  signature: PaletteKey;

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

  // Errors and destructive actions. Not accent: in Sage the accent is green
  // and in Paper a clay brown -- neither reads as "something went wrong".
  danger: string;

  dark: boolean;
}

// What a screen actually renders with -- a layout and a palette merged
// together (see composeTheme below). No `key`/`label`/`note` here: those are
// picker-identity metadata, not render inputs, and nothing reads them outside
// ThemePickerScreen/ProfileScreen (which read LAYOUTS/PALETTES directly).
export type Theme = Omit<Layout, 'label' | 'note' | 'signature'> & Omit<Palette, 'label' | 'note'>;

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
// across several attempted fixes. These four concepts replace it, worked out in a
// design-preview artifact first. thinBorder and layered/layeredVintage now
// render for real (cardShellStyle in ListItems.tsx, the hero box in
// HomeScreen.tsx) -- plain border or two-plain-Views-offset, no elevation
// either way. layered and layeredVintage share list: 'layered' (same safe
// stacking mechanism); layeredVintage adds decor: 'vintage' on top (the
// quatrefoil pattern on the back card, the faint grid wallpaper behind
// everything -- components/Decor.tsx). lineTone was folded into line: the
// two read the same on screen and its per-tag color scheme never landed.
export const LAYOUTS: Record<LayoutKey, Layout> = {
  line: {
    label: '라인',
    note: '잡지처럼. 가는 선과 세리프 제목, 시트도 각진 윗변에 실선 한 줄이에요.',
    signature: 'paper',
    headFamily: SERIF, headWeight: '400', headSize: 38, numSize: 78, numTrackEm: -0.035,
    cardRadius: 0, btnRadius: 999, list: 'line',
    hitStyle: 'marker', copy: 'plain', pulse: false, decor: 'none',
  },
  thinBorder: {
    label: '테두리',
    note: '미니멀 노트처럼. 카드·시트·버튼 모두 둥근 모서리에 1px 테두리예요.',
    signature: 'sage',
    headFamily: SERIF, headWeight: '400', headSize: 38, numSize: 70, numTrackEm: -0.035,
    cardRadius: 16, btnRadius: 999, list: 'bordered',
    hitStyle: 'marker', copy: 'plain', pulse: false, decor: 'none',
  },
  layered: {
    label: '레이어',
    note: '겹쳐 놓은 종이처럼. 카드·시트·버튼 뒤로 진한 종이가 한 장씩 삐져나와요.',
    signature: 'blush',
    headFamily: SERIF, headWeight: '400', headSize: 38, numSize: 70, numTrackEm: -0.035,
    cardRadius: 20, btnRadius: 999, list: 'layered',
    hitStyle: 'marker', copy: 'plain', pulse: false, decor: 'none',
  },
  layeredVintage: {
    label: '빈티지',
    note: '도서관 카드 목록처럼. 줄 쳐진 색인카드, 타자기체 라벨, 바탕엔 옅은 격자무늬예요.',
    signature: 'ink',
    headFamily: SERIF, headWeight: '400', headSize: 38, numSize: 70, numTrackEm: -0.035,
    cardRadius: 6, btnRadius: 4, list: 'layered',
    hitStyle: 'marker', copy: 'plain', pulse: false, decor: 'vintage',
  },
};

export const LAYOUT_ORDER: LayoutKey[] = ['line', 'thinBorder', 'layered', 'layeredVintage'];

// The four design concepts, as one value every component can switch on --
// list style alone can't tell layered from vintage (both stack cards), and
// sheets/buttons/inputs/tabs all change per concept, not just list rows.
export type Concept = 'line' | 'border' | 'layer' | 'vintage';

// Outline width for bordered surfaces (cards, pills, chips, fields, sheet
// edges). Not a plain 1: on Android a 1dp edge that lands on a fractional
// pixel row gets blended away -- the bottom edge of a pill or card would
// visibly vanish on some rows. 1.3dp always covers at least one full pixel.
export const OUTLINE = 1.3;

// Border styles that change with the concept must spell out all four sides.
// Android keeps a side-specific value (borderBottomColor, borderBottomWidth)
// from a previous style even after a later style sets the shorthand
// (borderColor) -- so switching line -> border left the line theme's
// faint/transparent bottom edge on cards and pill tabs ("bottom line cut
// off"), while layer -> border (no side-specific values) looked fine.
export function allEdges(width: number, color: string) {
  return {
    borderTopWidth: width,
    borderRightWidth: width,
    borderBottomWidth: width,
    borderLeftWidth: width,
    borderTopColor: color,
    borderRightColor: color,
    borderBottomColor: color,
    borderLeftColor: color,
  };
}

// Only a bottom rule (underline rows/tabs); the other three explicitly off.
export function bottomEdge(width: number, color: string) {
  return { ...allEdges(0, 'transparent'), borderBottomWidth: width, borderBottomColor: color };
}

// Color roles, the same in every theme:
// - ink: selected / active / primary. Tabs, toggles, checked photos and
//   list rows, radio dots -- anything that says "this one is on".
// - accent: meaning, never state. AI (sparkle, AI-written note), the
//   미분류 pile, recording, small brand marks. A selection never turns
//   accent, so a status never looks like something you tapped.
// - danger: errors and delete.
export function conceptOf(theme: Theme): Concept {
  if (theme.decor === 'vintage') return 'vintage';
  if (theme.list === 'layered') return 'layer';
  if (theme.list === 'bordered') return 'border';
  return 'line';
}

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
    danger: '#b23a2c',
    dark: false,
  },
  ink: {
    label: 'Ink', note: '어두운 잉크 블랙 + 앰버',
    bg: '#151417', ink: '#f2efe9', sub: '#a6a29a',
    line: '#2a2930', soft: '#232228', accent: '#d99a6c',
    surface: '#1c1b20', surfaceEdge: '#272630', ghost: '#242329', ghostBar: '#2d2c34',
    cardBg: '#252427', cardStack: '#a37451',
    danger: '#ec7b6b',
    dark: true,
  },
  neural: {
    label: 'Neural', note: '그래파이트 + 아이스 라벤더',
    bg: '#14171c', ink: '#eef1f5', sub: '#9aa6b6',
    line: '#22272e', soft: '#1b1f26', accent: '#a8b4ff',
    surface: '#191d23', surfaceEdge: '#22272e', ghost: '#202631', ghostBar: '#2a3038',
    cardBg: '#24272c', cardStack: '#7e87bf',
    danger: '#f08a8a',
    dark: true,
  },
  sage: {
    label: 'Sage', note: '밝은 세이지 + 흰 카드',
    bg: '#f4f2ec', ink: '#23251f', sub: '#5f6159',
    line: '#ddd9cf', soft: '#ffffff', accent: '#4f7360',
    surface: '#ffffff', surfaceEdge: null, ghost: '#e4e0d6', ghostBar: '#dcd8cf',
    cardBg: '#eceae4', cardStack: '#3f5c4d',
    danger: '#b23a2c',
    dark: false,
  },
  blush: {
    label: 'Blush', note: '따뜻한 로즈',
    bg: '#fbf6f4', ink: '#241c1b', sub: '#6d5b58',
    line: '#e8dad6', soft: '#ffffff', accent: '#b0524a',
    surface: '#ffffff', surfaceEdge: null, ghost: '#eadfdb', ghostBar: '#e0d1cd',
    cardBg: '#f2edec', cardStack: '#8d423b',
    danger: '#a3261d',
    dark: false,
  },
};

export const PALETTE_ORDER: PaletteKey[] = ['paper', 'ink', 'neural', 'sage', 'blush'];

export function composeTheme(layoutKey: LayoutKey, paletteKey: PaletteKey): Theme {
  const { label: _layoutLabel, note: _layoutNote, signature: _signature, ...layout } = LAYOUTS[layoutKey];
  const { label: _paletteLabel, note: _paletteNote, ...palette } = PALETTES[paletteKey];
  return { ...layout, ...palette };
}

/** em → RN letterSpacing (points), which is relative to the given font size. */
export function emToTracking(em: number, fontSize: number): number {
  return Math.round(em * fontSize * 100) / 100;
}
