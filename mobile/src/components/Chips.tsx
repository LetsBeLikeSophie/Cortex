import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Theme } from '../theme/themes';
import { PlusIcon } from './Icons';
import type { QueryChip } from '../hooks/useChipQuery';

// Home category tabs: an underline-tab strip in the "line" list themes,
// a pill-tab strip in the "card" list themes.
export function TabChip({ label, active, theme, onPress }: { label: string; active: boolean; theme: Theme; onPress: () => void }) {
  const card = theme.list === 'card';
  return (
    <Pressable onPress={onPress} style={card ? [styles.pillTab, { borderColor: active ? theme.ink : theme.line, backgroundColor: active ? theme.ink : 'transparent' }] : [styles.underlineTab, { borderBottomColor: active ? theme.ink : 'transparent' }]}>
      <Text
        style={{
          fontSize: card ? 12.5 : 13,
          color: card ? (active ? theme.bg : theme.sub) : active ? theme.ink : theme.sub,
          fontFamily: 'IBMPlexSansKR_400Regular',
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

// Sits at the end of the home-screen tab strip -- tapping it opens the tab
// picker so custom tag tabs can be added/removed, regardless of whether the
// strip currently renders as underline tabs or pill tabs.
export function TabAddChip({ theme, onPress }: { theme: Theme; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.tabAdd, { borderColor: theme.sub }]}>
      <PlusIcon size={13} color={theme.sub} strokeWidth={1.4} />
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
  const card = theme.list === 'card';
  const auto = tone === 'auto';
  const textColor = auto ? theme.sub : card ? theme.accent : theme.ink;
  return (
    <Pressable
      onPress={onRemove}
      disabled={!onRemove}
      style={[
        styles.tag,
        styles.tagRow,
        {
          paddingVertical: card ? 7 : 6,
          backgroundColor: card ? (auto ? theme.soft : theme.accent + '1f') : 'transparent',
          borderWidth: card ? 0 : 1,
          borderColor: auto ? theme.sub : theme.ink,
        },
      ]}
    >
      <Text style={{ fontSize: 13, color: textColor, fontFamily: 'IBMPlexSansKR_400Regular' }}>{label}</Text>
      {onRemove && <Text style={{ fontSize: 13, color: textColor, marginLeft: 6, opacity: 0.6 }}>×</Text>}
    </Pressable>
  );
}

// A fixed classification chip (channel/method) shown in the item detail's
// tag row alongside AI/user tags -- never tappable, never removable, since
// it isn't a tag at all: it's derived straight from source/capture_type,
// which no route can change.
export function MetaChip({ icon, label, theme }: { icon?: React.ReactNode; label: string; theme: Theme }) {
  const card = theme.list === 'card';
  return (
    <View
      style={[
        styles.tag,
        styles.tagRow,
        styles.metaChip,
        {
          paddingVertical: card ? 7 : 6,
          backgroundColor: card ? theme.soft : 'transparent',
          borderWidth: card ? 0 : 1,
          borderColor: theme.sub,
        },
      ]}
    >
      {icon}
      <Text style={{ fontSize: 13, color: theme.sub, fontFamily: 'IBMPlexSansKR_400Regular' }}>{label}</Text>
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
  const card = theme.list === 'card';
  const color = excluded ? theme.sub : card ? theme.accent : theme.ink;
  return (
    <View
      style={[
        styles.searchChip,
        card
          ? { backgroundColor: excluded ? theme.bg : theme.accent + '1f', borderWidth: excluded ? 1 : 0, borderColor: theme.line }
          : { borderWidth: 1, borderColor: excluded ? theme.sub : theme.ink },
      ]}
    >
      <Pressable onPress={onToggle} hitSlop={4} style={styles.searchChipText}>
        <Text style={{ fontSize: 13.5, color, fontFamily: 'IBMPlexSansKR_500Medium', textDecorationLine: excluded ? 'line-through' : 'none' }}>
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
    <Pressable onPress={onPress} style={[styles.tag, { borderWidth: 1, borderStyle: 'dashed', borderColor: theme.sub, paddingVertical: 6 }]}>
      <Text style={{ fontSize: 13, color: theme.sub, fontFamily: 'IBMPlexSansKR_400Regular' }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pillTab: { paddingHorizontal: 13, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
  underlineTab: { paddingBottom: 10, borderBottomWidth: 2 },
  tag: { borderRadius: 999, paddingHorizontal: 14 },
  tagRow: { flexDirection: 'row', alignItems: 'center' },
  metaChip: { gap: 5 },
  searchChip: { flexDirection: 'row', alignItems: 'center', height: 34, borderRadius: 999, paddingLeft: 13, paddingRight: 4 },
  searchChipText: { paddingVertical: 4 },
  searchChipX: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center' },
  chipQueryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  tabAdd: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
