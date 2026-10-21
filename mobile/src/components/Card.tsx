import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { OUTLINE, Theme, allEdges, bottomEdge, conceptOf } from '../theme/themes';
import { LayeredBack } from './Decor';

// The one definition of "a card" per layout, shared by the home/search
// lists (ListItems.tsx) and every other screen that shows boxed rows or
// sections (trash, stats, save results). Screens used to branch on the
// retired list: 'card' instead -- always false, so they rendered the line
// layout's rules in every theme.
//
// No shadow/elevation anywhere: pairing elevation with overflow:hidden is
// what caused the old Android "shadow rounded, content square" bug.
// 'bordered' is a plain outline; 'layered' returns only the FRONT card's
// fill -- its offset back card is a sibling View (see <Card> below).
export function cardShellStyle(theme: Theme): ViewStyle {
  switch (theme.list) {
    case 'line':
      return { ...bottomEdge(1, theme.soft), paddingVertical: 20 };
    case 'bordered':
      return {
        backgroundColor: theme.surface,
        ...allEdges(OUTLINE, theme.line),
        borderRadius: theme.cardRadius,
        padding: 15,
        paddingHorizontal: 17,
        marginBottom: 9,
      };
    case 'layered':
      return {
        backgroundColor: theme.cardBg,
        ...allEdges(0, 'transparent'),
        borderRadius: theme.cardRadius,
        padding: 15,
        paddingHorizontal: 17,
      };
  }
}

// The layered back card: same radius as the front, offset 6px down-right,
// painted behind it purely by JSX order.
export const LAYERED_BACK_OFFSET: ViewStyle = { position: 'absolute', top: 6, left: 6, right: -6, bottom: -6 };

// A plain framed box (profile rows, the sign-out/login buttons, the paywall
// card): outlined everywhere except layer, which never outlines -- it fills
// with the card tone instead.
export function frameStyle(theme: Theme): ViewStyle {
  return conceptOf(theme) === 'layer'
    ? { ...allEdges(0, 'transparent'), backgroundColor: theme.cardBg }
    : { ...allEdges(OUTLINE, theme.line) };
}

// Boxed layouts (everything but line) sit their content a little further
// in from the screen edge than line's full-bleed rules.
export function isBoxed(theme: Theme): boolean {
  return theme.list !== 'line';
}

export function screenGutter(theme: Theme): number {
  return isBoxed(theme) ? 24 : 26;
}

// A card in the current layout. `style` adjusts padding/layout inside the
// card -- keep margins off it (the layered wrapper owns the spacing, and a
// margin on the front card would push the back card out of line).
export function Card({ theme, style, children }: { theme: Theme; style?: StyleProp<ViewStyle>; children: React.ReactNode }) {
  const front = <View style={[cardShellStyle(theme), style]}>{children}</View>;
  if (theme.list !== 'layered') return front;
  return (
    <View style={styles.layeredWrap}>
      <LayeredBack theme={theme} radius={theme.cardRadius} style={LAYERED_BACK_OFFSET} />
      {front}
    </View>
  );
}

const styles = StyleSheet.create({
  layeredWrap: { position: 'relative', marginBottom: 16 },
});
