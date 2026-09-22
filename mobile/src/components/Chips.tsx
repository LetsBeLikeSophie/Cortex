import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Theme } from '../theme/themes';

// Home's tab strip: 즐겨찾기 + one per channel, fixed rather than user-picked
// -- an underline-tab strip in the "line" list themes, a pill-tab strip in
// the "card" list themes. `icon` renders a channel's SourceIcon at the same
// color the label uses, so it inverts with it on the active/pill variant.
export function TabChip({
  label,
  icon,
  active,
  theme,
  onPress,
}: {
  label: string;
  icon?: React.ReactNode;
  active: boolean;
  theme: Theme;
  onPress: () => void;
}) {
  const card = theme.list === 'card';
  return (
    <Pressable
      onPress={onPress}
      style={
        card
          ? [styles.pillTab, { borderColor: active ? theme.ink : theme.line, backgroundColor: active ? theme.ink : 'transparent' }]
          : [styles.underlineTab, { borderBottomColor: active ? theme.ink : 'transparent' }]
      }
    >
      <View style={styles.tabContent}>
        {icon}
        <Text
          style={{
            fontSize: card ? 12.5 : 13,
            color: card ? (active ? theme.bg : theme.sub) : active ? theme.ink : theme.sub,
            fontFamily: 'IBMPlexSansKR_400Regular',
          }}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

// `onRemove` turns this into a tap-to-remove control (used in the item
// detail sheet to edit auto-assigned tags) -- omit it for the plain
// read-only display used elsewhere (e.g. SaveSheetScreen's post-save view).
export function TagChip({ label, theme, onRemove }: { label: string; theme: Theme; onRemove?: () => void }) {
  const card = theme.list === 'card';
  return (
    <Pressable
      onPress={onRemove}
      disabled={!onRemove}
      style={[
        styles.tag,
        styles.tagRow,
        {
          paddingVertical: card ? 7 : 6,
          backgroundColor: card ? theme.accent + '1f' : 'transparent',
          borderWidth: card ? 0 : 1,
          borderColor: theme.ink,
        },
      ]}
    >
      <Text style={{ fontSize: 13, color: card ? theme.accent : theme.ink, fontFamily: 'IBMPlexSansKR_400Regular' }}>
        {label}
      </Text>
      {onRemove && (
        <Text style={{ fontSize: 13, color: card ? theme.accent : theme.ink, marginLeft: 6, opacity: 0.6 }}>×</Text>
      )}
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
  tabContent: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tag: { borderRadius: 999, paddingHorizontal: 14 },
  tagRow: { flexDirection: 'row', alignItems: 'center' },
  metaChip: { gap: 5 },
});
