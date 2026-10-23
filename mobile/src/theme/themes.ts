import { strings } from '../i18n';

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

  // The only place corner radii live -- components read these instead of
  // keeping their own per-concept numbers.
  // cardRadius: list cards, sections, confirm cards, paywall card.
  // btnRadius: md buttons (sheet actions, sign-out, login) and sm ones.
  // pickRadius: small pickers (사진 선택, 복원, AI로 다시 정리).
  cardRadius: number;
  btnRadius: number;
  pickRadius: number;
  list: ListStyle;

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
  // Text/icons drawn ON an accent fill (vintage's stamp button, the theme
  // picker's check). White only where it actually reads: the light amber
  // and lavender accents of Ink/Neural need dark text (white was 2.4:1 and
  // 2.0:1 there).
  onAccent: string;

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
const T = strings({
  ko: {
    line: '라인',
    lineNote: '잡지처럼. 가는 선과 세리프 제목, 시트도 각진 윗변에 실선 한 줄이에요.',
    border: '테두리',
    borderNote: '미니멀 노트처럼. 산세리프 숫자·제목에, 카드·시트·버튼 모두 둥근 모서리에 1px 테두리예요.',
    layer: '레이어',
    layerNote: '겹쳐 놓은 종이처럼. 카드·시트·버튼 뒤로 진한 종이가 한 장씩 삐져나와요.',
    vintage: '빈티지',
    vintageNote: '도서관 카드 목록처럼. 줄 쳐진 색인카드, 타자기체 라벨, 바탕엔 옅은 격자무늬예요.',
    paper: '종이빛 크림 + 점토색',
    ink: '어두운 잉크 블랙 + 앰버',
    neural: '그래파이트 + 아이스 라벤더',
    sage: '밝은 세이지 + 흰 카드',
    blush: '따뜻한 로즈',
  },
  en: {
    line: 'Line',
    lineNote: 'Like a magazine. Thin rules, serif titles, and sheets with one sharp top line.',
    border: 'Border',
    borderNote: 'Like a minimal notebook. Sans-serif numbers and titles, 1px borders with rounded corners everywhere.',
    layer: 'Layer',
    layerNote: 'Like stacked paper. A darker sheet peeks out behind every card, sheet and button.',
    vintage: 'Vintage',
    vintageNote: 'Like a library card catalog. Ruled index cards, typewriter labels, a faint grid behind.',
    paper: 'Paper cream + clay',
    ink: 'Dark ink black + amber',
    neural: 'Graphite + ice lavender',
    sage: 'Light sage + white cards',
    blush: 'Warm rose',
  },
  ja: {
    line: 'ライン',
    lineNote: '雑誌のように。細い線とセリフの見出し、シートも角ばった上辺に実線1本です。',
    border: 'ボーダー',
    borderNote: 'ミニマルなノートのように。サンセリフの数字と見出し、どれも角丸に1pxの枠線です。',
    layer: 'レイヤー',
    layerNote: '重ねた紙のように。カード・シート・ボタンの後ろから濃い紙が1枚ずつのぞきます。',
    vintage: 'ヴィンテージ',
    vintageNote: '図書館のカード目録のように。罫線入りの索引カード、タイプライター体のラベル、背景に薄い格子柄。',
    paper: '紙色クリーム + テラコッタ',
    ink: '濃いインクブラック + アンバー',
    neural: 'グラファイト + アイスラベンダー',
    sage: '明るいセージ + 白いカード',
    blush: '温かいローズ',
  },
  'zh-Hans': {
    line: '线条',
    lineNote: '像杂志。细线和衬线标题，面板顶边方正，只有一条实线。',
    border: '边框',
    borderNote: '像极简笔记本。无衬线数字和标题，卡片、面板、按钮都是圆角 1px 边框。',
    layer: '叠层',
    layerNote: '像叠放的纸。卡片、面板、按钮后面各露出一张深色的纸。',
    vintage: '复古',
    vintageNote: '像图书馆卡片目录。带横线的索引卡、打字机字体标签，背景是浅浅的格纹。',
    paper: '纸色奶油 + 陶土色',
    ink: '深墨黑 + 琥珀色',
    neural: '石墨灰 + 冰薰衣草',
    sage: '浅鼠尾草绿 + 白卡片',
    blush: '温暖玫瑰色',
  },
  'zh-Hant': {
    line: '線條',
    lineNote: '像雜誌。細線和襯線標題，面板頂邊方正，只有一條實線。',
    border: '邊框',
    borderNote: '像極簡筆記本。無襯線數字和標題，卡片、面板、按鈕都是圓角 1px 邊框。',
    layer: '疊層',
    layerNote: '像疊放的紙。卡片、面板、按鈕後面各露出一張深色的紙。',
    vintage: '復古',
    vintageNote: '像圖書館卡片目錄。有橫線的索引卡、打字機字體標籤，背景是淡淡的格紋。',
    paper: '紙色奶油 + 陶土色',
    ink: '深墨黑 + 琥珀色',
    neural: '石墨灰 + 冰薰衣草',
    sage: '淺鼠尾草綠 + 白卡片',
    blush: '溫暖玫瑰色',
  },
});

export const LAYOUTS: Record<LayoutKey, Layout> = {
  line: {
    label: T.line,
    note: T.lineNote,
    signature: 'paper',
    headFamily: SERIF, headWeight: '400', headSize: 38, numSize: 78, numTrackEm: -0.035,
    cardRadius: 0, btnRadius: 999, pickRadius: 999, list: 'line',
    decor: 'none',
  },
  thinBorder: {
    label: T.border,
    note: T.borderNote,
    signature: 'sage',
    // Grotesk carries no Hangul (neither does the serif), so Korean titles
    // are the system sans either way -- this changes the big count, Latin
    // and the row numbers. The file is already the semibold cut; weight
    // stays '400' so Android doesn't go looking for a synthetic bold.
    headFamily: GROTESK_SEMIBOLD, headWeight: '400', headSize: 38, numSize: 66, numTrackEm: -0.04,
    cardRadius: 16, btnRadius: 999, pickRadius: 999, list: 'bordered',
    decor: 'none',
  },
  layered: {
    label: T.layer,
    note: T.layerNote,
    signature: 'blush',
    headFamily: SERIF, headWeight: '400', headSize: 38, numSize: 70, numTrackEm: -0.035,
    cardRadius: 20, btnRadius: 14, pickRadius: 12, list: 'layered',
    decor: 'none',
  },
  layeredVintage: {
    label: T.vintage,
    note: T.vintageNote,
    signature: 'ink',
    headFamily: SERIF, headWeight: '400', headSize: 38, numSize: 70, numTrackEm: -0.035,
    cardRadius: 6, btnRadius: 3, pickRadius: 3, list: 'layered',
    decor: 'vintage',
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

// Layer's controls (ghost buttons, fields, chips, icon buttons, framed rows)
// are fills sitting on fills only a few percent apart -- Blush's bg on its
// cardBg sheet is about 1.08:1 -- so they get a faint edge in the stack
// color. Still no structural outlines: cards keep their back sheet instead.
export function layerEdge(theme: Theme) {
  return allEdges(OUTLINE, theme.cardStack + '40');
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
    label: 'Paper', note: T.paper,
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
    onAccent: '#ffffff',
    dark: false,
  },
  ink: {
    label: 'Ink', note: T.ink,
    bg: '#151417', ink: '#f2efe9', sub: '#a6a29a',
    line: '#2a2930', soft: '#232228', accent: '#d99a6c',
    surface: '#1c1b20', surfaceEdge: '#272630', ghost: '#242329', ghostBar: '#2d2c34',
    cardBg: '#252427', cardStack: '#a37451',
    danger: '#ec7b6b',
    onAccent: '#151417',
    dark: true,
  },
  neural: {
    label: 'Neural', note: T.neural,
    bg: '#14171c', ink: '#eef1f5', sub: '#9aa6b6',
    line: '#22272e', soft: '#1b1f26', accent: '#a8b4ff',
    surface: '#191d23', surfaceEdge: '#22272e', ghost: '#202631', ghostBar: '#2a3038',
    cardBg: '#24272c', cardStack: '#7e87bf',
    danger: '#f08a8a',
    onAccent: '#14171c',
    dark: true,
  },
  sage: {
    label: 'Sage', note: T.sage,
    bg: '#f4f2ec', ink: '#23251f', sub: '#5f6159',
    line: '#ddd9cf', soft: '#ffffff', accent: '#4f7360',
    surface: '#ffffff', surfaceEdge: null, ghost: '#e4e0d6', ghostBar: '#dcd8cf',
    cardBg: '#eceae4', cardStack: '#3f5c4d',
    danger: '#b23a2c',
    onAccent: '#ffffff',
    dark: false,
  },
  blush: {
    label: 'Blush', note: T.blush,
    bg: '#fbf6f4', ink: '#241c1b', sub: '#6d5b58',
    line: '#e8dad6', soft: '#ffffff', accent: '#b0524a',
    surface: '#ffffff', surfaceEdge: null, ghost: '#eadfdb', ghostBar: '#e0d1cd',
    cardBg: '#f2edec', cardStack: '#8d423b',
    danger: '#a3261d',
    onAccent: '#ffffff',
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
