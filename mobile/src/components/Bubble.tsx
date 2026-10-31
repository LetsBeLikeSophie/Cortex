import React from 'react';
import { Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { BODY_KR_MEDIUM, Theme } from '../theme/themes';

// Uses left show only when they're running out (or the action spends on
// every press), so a screen doesn't carry a count nobody needs yet.
const LOW_USES = 5;
export const isLowOnUses = (left: number | null | undefined): left is number => left != null && left <= LOW_USES;

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
      <View style={[styles.tail, TAIL[tail], (tail === 'up' || tail === 'down') && { right: tailInset }, { backgroundColor: theme.accent }]} />
      <Text style={[styles.label, { color: theme.onAccent }]}>{label}</Text>
    </>
  );
  const shell = [styles.bubble, { backgroundColor: theme.accent, borderRadius: theme.pickRadius }, style];
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

const TAIL: Record<'up' | 'down' | 'left' | 'right', ViewStyle> = {
  up: { top: -3 },
  down: { bottom: -3 },
  left: { left: -3, top: '50%', marginTop: -4 },
  right: { right: -3, top: '50%', marginTop: -4 },
};

const styles = StyleSheet.create({
  bubble: { alignSelf: 'flex-start', flexShrink: 1, paddingHorizontal: 10, paddingVertical: 5 },
  tail: { position: 'absolute', width: 8, height: 8, transform: [{ rotate: '45deg' }] },
  label: { flexShrink: 1, fontSize: 12, fontFamily: BODY_KR_MEDIUM },
  pressed: { opacity: 0.75 },
});
