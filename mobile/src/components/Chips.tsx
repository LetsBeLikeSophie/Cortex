import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Theme } from '../theme/themes';
import { PlusIcon } from './Icons';

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
// picker so custom category tabs can be added/removed, regardless of
// whether the strip currently renders as underline tabs or pill tabs.
export function TabAddChip({ theme, onPress }: { theme: Theme; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.tabAdd, { borderColor: theme.sub }]}>
      <PlusIcon size={13} color={theme.sub} strokeWidth={1.4} />
    </Pressable>
  );
}

export function TagChip({ label, theme }: { label: string; theme: Theme }) {
  const card = theme.list === 'card';
  return (
    <View
      style={[
        styles.tag,
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
