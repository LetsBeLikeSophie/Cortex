import React from 'react';
import { screenGutter } from './Card';
import { StyleSheet, View } from 'react-native';
import { IconButton } from './Buttons';
import { Theme } from '../theme/themes';
import { BackIcon } from './Icons';
import { Heading } from './Typography';

// The back-button + title row Stats, Profile, and Trash were each hand-
// copying verbatim (same circular back button, same heading formula).
export function ScreenHeader({ title, theme, onBack }: { title: string; theme: Theme; onBack: () => void }) {
  return (
    <View style={[styles.header, { paddingHorizontal: screenGutter(theme) }]}>
      <IconButton theme={theme} onPress={onBack} label="뒤로">
        <BackIcon size={16} color={theme.ink} strokeWidth={1.5} />
      </IconButton>
      <Heading theme={theme} offset={8}>
        {title}
      </Heading>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingTop: 20, paddingBottom: 18 },
});
