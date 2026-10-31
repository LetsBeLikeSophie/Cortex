import React from 'react';
import { Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { BODY_KR_MEDIUM, Theme } from '../theme/themes';

// Uses left show only when they're running out (or the action spends on
// every press), so a screen doesn't carry a count nobody needs yet.
const LOW_USES = 5;
export const isLowOnUses = (left: number | null | undefined): left is number => left != null && left <= LOW_USES;

// The tail needs a straight stretch of edge to sit on: on a pill-shaped theme
// (pickRadius 999) a side has none, and the tail came apart from the body.
const MAX_RADIUS = 8;
const TAIL_BASE = 10;
const TAIL_DEPTH = 5;

// The filled speech bubble for what an AI action has left: accent means AI,
// so accent fill with onAccent text in every theme. `tail` is the side it
// points from, at whatever it talks about. Tapped only when given onPress;
// otherwise touches pass through it.
export function Bubble({
  theme,
  label,
  tail,
  tailInset = 14,
  onPress,
  style,
}: {
  theme: Theme;
  label: string;
  tail: 'up' | 'down' | 'left' | 'right';
  // From the right edge, for an up/down tail.
  tailInset?: number;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const body = (
    <>
      <Tail side={tail} color={theme.accent} inset={tailInset} />
      <Text style={[styles.label, { color: theme.onAccent }]}>{label}</Text>
    </>
  );
  const shell = [styles.bubble, { backgroundColor: theme.accent, borderRadius: Math.min(theme.pickRadius, MAX_RADIUS) }, style];
  return onPress ? (
    <Pressable onPress={onPress} hitSlop={6} accessibilityRole="button" style={({ pressed }) => [shell, pressed && styles.pressed]}>
      {body}
    </Pressable>
  ) : (
    <View pointerEvents="none" style={shell}>
      {body}
    </View>
  );
}

// Overlaps the body by 1, so no seam shows between them.
function Tail({ side, color, inset }: { side: 'up' | 'down' | 'left' | 'right'; color: string; inset: number }) {
  const b = TAIL_BASE;
  const d = TAIL_DEPTH + 1;
  if (side === 'left' || side === 'right') {
    return (
      <View style={[styles.sideTail, { width: d }, side === 'left' ? { left: -TAIL_DEPTH } : { right: -TAIL_DEPTH }]}>
        <Svg width={d} height={b}>
          <Path d={side === 'left' ? `M${d} 0L0 ${b / 2}L${d} ${b}Z` : `M0 0L${d} ${b / 2}L0 ${b}Z`} fill={color} />
        </Svg>
      </View>
    );
  }
  return (
    <View style={[styles.endTail, { right: inset }, side === 'up' ? { top: -TAIL_DEPTH } : { bottom: -TAIL_DEPTH }]}>
      <Svg width={b} height={d}>
        <Path d={side === 'up' ? `M0 ${d}L${b / 2} 0L${b} ${d}Z` : `M0 0L${b / 2} ${d}L${b} 0Z`} fill={color} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: { alignSelf: 'flex-start', flexShrink: 1, justifyContent: 'center', paddingHorizontal: 10, paddingVertical: 5 },
  sideTail: { position: 'absolute', top: 0, bottom: 0, justifyContent: 'center' },
  endTail: { position: 'absolute' },
  // Android's font padding sat the text low in the bubble.
  label: { flexShrink: 1, fontSize: 12, lineHeight: 16, includeFontPadding: false, textAlignVertical: 'center', fontFamily: BODY_KR_MEDIUM },
  pressed: { opacity: 0.75 },
});
