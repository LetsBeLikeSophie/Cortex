import React from 'react';
import { StyleProp, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';
import { BODY_KR, Theme, emToTracking } from '../theme/themes';

// The screen-title formula every screen was respelling by hand (family,
// weight, tracking, line-height all derived from the theme) -- only the
// size differs, as an offset from the theme's own headSize: 0 for a
// full-page title (Search), 8 for a sub-screen's back-button header
// (Stats/Profile/Trash). A sheet's title is SheetTitle below.
export function Heading({
  theme,
  offset = 0,
  size: fixedSize,
  style,
  children,
}: {
  theme: Theme;
  offset?: number;
  // Overrides the offset-from-theme calculation for a heading whose size is
  // fixed regardless of theme (e.g. a bottom-sheet's own title, unlike a
  // page title which is meant to track the theme's scale).
  size?: number;
  style?: StyleProp<TextStyle>;
  children: React.ReactNode;
}) {
  const size = fixedSize ?? theme.headSize - offset;
  return (
    <Text
      style={[
        {
          fontFamily: theme.headFamily,
          fontWeight: theme.headWeight,
          fontSize: size,
          lineHeight: size * 1.15,
          letterSpacing: emToTracking(-0.02, size),
          color: theme.ink,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

export const SHEET_TITLE_SIZE = 20;

// Every sheet opens the same way: the title, its one description right under
// it, and only then the sheet's content (tags, lists, fields).
export function SheetTitle({
  theme,
  title,
  sub,
  icon,
  inset = 4,
  style,
}: {
  theme: Theme;
  title: string;
  sub?: string;
  icon?: React.ReactNode;
  inset?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[{ paddingHorizontal: inset }, style]}>
      <View style={styles.titleRow}>
        {icon}
        <Heading theme={theme} size={SHEET_TITLE_SIZE} style={styles.title}>
          {title}
        </Heading>
      </View>
      {!!sub && <Text style={[styles.sub, { color: theme.sub }]}>{sub}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flexShrink: 1 },
  sub: { fontSize: 13, lineHeight: 19, marginTop: 6, fontFamily: BODY_KR },
});
