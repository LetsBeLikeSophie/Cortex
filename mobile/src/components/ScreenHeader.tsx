import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Theme } from '../theme/themes';
import { BackIcon } from './Icons';
import { Heading } from './Typography';

// The back-button + title row Stats, Profile, and Trash were each hand-
// copying verbatim (same circular back button, same heading formula).
export function ScreenHeader({ title, theme, onBack }: { title: string; theme: Theme; onBack: () => void }) {
  const card = theme.list === 'card';
  return (
    <View style={[styles.header, { paddingHorizontal: card ? 24 : 26 }]}>
      <Pressable onPress={onBack} style={[styles.backButton, { borderColor: theme.line }]} hitSlop={8}>
        <BackIcon size={16} color={theme.ink} strokeWidth={1.5} />
      </Pressable>
      <Heading theme={theme} offset={8}>
        {title}
      </Heading>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingTop: 20, paddingBottom: 18 },
  backButton: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
