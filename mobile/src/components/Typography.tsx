import React from 'react';
import { StyleProp, Text, TextStyle } from 'react-native';
import { Theme, emToTracking } from '../theme/themes';

// The screen-title formula every screen was respelling by hand (family,
// weight, tracking, line-height all derived from the theme) -- only the
// size differs, as an offset from the theme's own headSize: 0 for a
// full-page title (Search), 2 for a modal-sheet title (SaveSheet), 8 for a
// sub-screen's back-button header (Stats/Profile/Trash).
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
