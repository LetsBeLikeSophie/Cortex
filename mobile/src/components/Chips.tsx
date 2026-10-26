import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MONO, OUTLINE, Theme, allEdges, bottomEdge, conceptOf, layerEdge, BODY_KR, BODY_KR_MEDIUM } from '../theme/themes';
import type { QueryChip } from '../hooks/useChipQuery';
import { strings } from '../i18n';

const S = strings({
  ko: { tabSettings: '태그 설정', unsorted: '미분류', unsortedCount: (n: number) => `미분류 ${n}건` },
  en: { tabSettings: 'Tabs', unsorted: 'Unsorted', unsortedCount: (n: number) => `Unsorted, ${n}` },
  ja: { tabSettings: 'タグ設定', unsorted: '未分類', unsortedCount: (n: number) => `未分類 ${n}件` },
  'zh-Hans': { tabSettings: '标签设置', unsorted: '未分类', unsortedCount: (n: number) => `未分类 ${n} 条` },
  'zh-Hant': { tabSettings: '標籤設定', unsorted: '未分類', unsortedCount: (n: number) => `未分類 ${n} 則` },
});

// Home tag tabs, per concept: line = underline tabs; border = outlined
// pills; layer = filled paper pills (active one inked); vintage = underline
// tabs in the typewriter face.
export function TabChip({ label, active, theme, onPress }: { label: string; active: boolean; theme: Theme; onPress: () => void }) {
  const concept = conceptOf(theme);
  const pill = concept === 'border' || concept === 'layer';
  const shell = pill
    ? concept === 'border'
      ? [styles.pillTab, allEdges(OUTLINE, active ? theme.ink : theme.line), { backgroundColor: 'transparent' }]
      : [styles.pillTab, allEdges(0, 'transparent'), { backgroundColor: active ? theme.ink : theme.cardBg }]
    : [styles.underlineTab, bottomEdge(2, active ? theme.ink : 'transparent'), { backgroundColor: 'transparent' }];
  const color = concept === 'layer' ? (active ? theme.bg : theme.sub) : active ? theme.ink : theme.sub;
  return (
    <Pressable onPress={onPress} style={shell}>
      <Text
        style={{
          fontSize: concept === 'vintage' ? 12.5 : pill ? 12.5 : 13,
          color,
          fontFamily: concept === 'vintage' ? MONO : BODY_KR,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

// Shared shell for tag-like chips (TagChip / MetaChip / SearchChip): layer
// fills them like little paper slips, every other concept outlines them --
// vintage with near-square corners, like a typed label.
function chipShell(theme: Theme, muted: boolean, tint: boolean) {
  const concept = conceptOf(theme);
  if (concept === 'layer') {
    // theme.bg, not cardBg: these chips mostly sit on layer sheets, which
    // are cardBg themselves -- a cardBg chip there has no visible fill.
    return { ...layerEdge(theme), paddingVertical: 6, backgroundColor: tint && !muted ? theme.accent + '1f' : theme.bg };
  }
  return {
    ...allEdges(OUTLINE, muted ? theme.sub : concept === 'border' ? theme.line : theme.ink),
    paddingVertical: 6,
    backgroundColor: 'transparent',
    ...(concept === 'vintage' ? { borderRadius: 3 } : null),
  };
}

// Dashed "add something" chip -- "+ 태그" and the voice-tag mic share it so
// they read as one pair of controls. Corner follows the concept's chips.
export function addChipShell(theme: Theme) {
  return {
    borderWidth: OUTLINE,
    borderStyle: 'dashed' as const,
    borderColor: theme.sub,
    paddingVertical: 6,
    borderRadius: conceptOf(theme) === 'vintage' ? 3 : 999,
  };
}

function chipFont(theme: Theme) {
  return conceptOf(theme) === 'vintage' ? MONO : BODY_KR;
}

// The 미분류 tab. Deliberately not a normal tab in a different state: it's
// a pile waiting for AI, so it carries the accent (AI/attention role) with
// a dot + count, in the concept's own tab shape. Selected, it fills/rules
// in accent instead of ink, so it never looks like "모두" or a tag tab.
export function PileTabChip({ count, active, theme, onPress }: { count: number; active: boolean; theme: Theme; onPress: () => void }) {
  const concept = conceptOf(theme);
  const pill = concept === 'border' || concept === 'layer';
  const shell = pill
    ? [
        styles.pillTab,
        styles.pileRow,
        concept === 'border' ? allEdges(OUTLINE, active ? theme.accent : theme.accent + '55') : allEdges(0, 'transparent'),
        { backgroundColor: active ? theme.accent : theme.accent + '17' },
      ]
    : [styles.underlineTab, styles.pileRow, bottomEdge(2, active ? theme.accent : 'transparent'), { backgroundColor: 'transparent' }];
  const fg = pill && active ? theme.bg : theme.accent;
  const font = concept === 'vintage' ? MONO : BODY_KR_MEDIUM;
  return (
    <Pressable onPress={onPress} style={shell} accessibilityLabel={S.unsortedCount(count)}>
      {/* Always rendered (just recolored) so selecting it doesn't shrink the tab. */}
      <View style={[styles.pileDot, { backgroundColor: fg }]} />
      <Text style={{ fontSize: pill ? 12.5 : 13, color: fg, fontFamily: font }}>{S.unsorted}</Text>
      <Text style={{ fontSize: pill ? 11.5 : 12, color: fg, fontFamily: MONO, opacity: 0.85 }}>{count}</Text>
    </Pressable>
  );
}

// Sits at the end of the home-screen tab strip -- tapping it opens the tab
// picker so custom tag tabs can be added/removed, regardless of whether the
// strip currently renders as underline tabs or pill tabs.
export function TabAddChip({ theme, onPress }: { theme: Theme; onPress: () => void }) {
  return (
    // Opens the tab picker, which both adds and removes tabs -- so it reads
    // as "settings", not "+".
    <Pressable
      onPress={onPress}
      accessibilityLabel={S.tabSettings}
      style={[styles.tabAdd, styles.tabSettings, { borderColor: theme.sub, borderRadius: conceptOf(theme) === 'vintage' ? 3 : 13 }]}
    >
      <Text style={{ fontSize: 12, color: theme.sub, fontFamily: BODY_KR }}>{S.tabSettings}</Text>
    </Pressable>
  );
}

// `onRemove` turns this into a tap-to-remove control -- omit it for the
// plain read-only display used elsewhere (e.g. SaveSheetScreen's post-save
// view). `tone: 'auto'` is the muted styling for an AI-assigned tag, kept
// visually distinct from a user-added one (same theme.sub language
// MetaChip already uses for "not something you typed") even though both
// are removable the same way.
export function TagChip({
  label,
  theme,
  onRemove,
  tone = 'default',
}: {
  label: string;
  theme: Theme;
  onRemove?: () => void;
  tone?: 'default' | 'auto';
}) {
  const auto = tone === 'auto';
  const textColor = auto ? theme.sub : conceptOf(theme) === 'layer' ? theme.accent : theme.ink;
  return (
    <Pressable
      onPress={onRemove}
      disabled={!onRemove}
      style={[
        styles.tag,
        styles.tagRow,
        chipShell(theme, auto, true),
      ]}
    >
      <Text style={{ fontSize: 13, color: textColor, fontFamily: chipFont(theme) }}>{label}</Text>
      {onRemove && <Text style={{ fontSize: 13, color: textColor, marginLeft: 6, opacity: 0.6 }}>×</Text>}
    </Pressable>
  );
}

// A fixed classification chip (channel/method) shown in the item detail's
// tag row alongside AI/user tags -- never tappable, never removable, since
// it isn't a tag at all: it's derived straight from source/capture_type,
// which no route can change.
export function MetaChip({ icon, label, theme }: { icon?: React.ReactNode; label: string; theme: Theme }) {
  return (
    <View style={[styles.tag, styles.tagRow, styles.metaChip, chipShell(theme, true, false)]}>
      {icon}
      <Text style={{ fontSize: 13, color: theme.sub, fontFamily: chipFont(theme) }}>{label}</Text>
    </View>
  );
}

// A search-box tag chip: tapping the text toggles include/exclude (excluded
// reads with a strike-through), the × removes it from the query entirely.
export function SearchChip({
  label,
  excluded,
  theme,
  onToggle,
  onRemove,
}: {
  label: string;
  excluded: boolean;
  theme: Theme;
  onToggle: () => void;
  onRemove: () => void;
}) {
  const layer = conceptOf(theme) === 'layer';
  const color = excluded ? theme.sub : layer ? theme.accent : theme.ink;
  return (
    <View style={[styles.searchChip, chipShell(theme, excluded, true), { paddingVertical: 0 }]}>
      <Pressable onPress={onToggle} hitSlop={4} style={styles.searchChipText}>
        <Text
          style={{
            fontSize: 13.5,
            color,
            fontFamily: conceptOf(theme) === 'vintage' ? MONO : BODY_KR_MEDIUM,
            textDecorationLine: excluded ? 'line-through' : 'none',
          }}
        >
          {label}
        </Text>
      </Pressable>
      <Pressable onPress={onRemove} hitSlop={8} style={styles.searchChipX}>
        <Text style={{ fontSize: 15, color, opacity: 0.55 }}>×</Text>
      </Pressable>
    </View>
  );
}

// The whole wrapping row of chips for a useChipQuery() input -- pulled out
// of SearchScreen so the "type a word, toggle it, × removes it" input reads
// as one reusable unit rather than screen-specific wiring.
export function ChipQueryRow({
  chips,
  theme,
  onToggle,
  onRemove,
}: {
  chips: QueryChip[];
  theme: Theme;
  onToggle: (id: number) => void;
  onRemove: (id: number) => void;
}) {
  if (chips.length === 0) return null;
  return (
    <View style={styles.chipQueryRow}>
      {chips.map((chip) => (
        <SearchChip
          key={chip.id}
          label={chip.text}
          excluded={chip.excluded}
          theme={theme}
          onToggle={() => onToggle(chip.id)}
          onRemove={() => onRemove(chip.id)}
        />
      ))}
    </View>
  );
}

export function TagAddChip({ label, theme, onPress }: { label: string; theme: Theme; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.tag, addChipShell(theme)]}>
      <Text style={{ fontSize: 13, color: theme.sub, fontFamily: chipFont(theme) }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pillTab: { paddingHorizontal: 13, paddingVertical: 6, borderRadius: 999 },
  underlineTab: { paddingBottom: 10 },
  tag: { borderRadius: 999, paddingHorizontal: 14 },
  tagRow: { flexDirection: 'row', alignItems: 'center' },
  metaChip: { gap: 5 },
  searchChip: { flexDirection: 'row', alignItems: 'center', height: 34, borderRadius: 999, paddingLeft: 13, paddingRight: 4 },
  searchChipText: { paddingVertical: 4 },
  searchChipX: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center' },
  chipQueryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  pileRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  pileDot: { width: 5, height: 5, borderRadius: 3 },
  tabSettings: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, width: undefined },
  tabAdd: {
    width: 26,
    height: 26,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
