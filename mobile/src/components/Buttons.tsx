import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { MONO, OUTLINE, Theme, allEdges, conceptOf } from '../theme/themes';
import { DashedRule } from './Decor';

interface ButtonProps {
  label: string;
  onPress?: () => void;
  theme: Theme;
  flex?: number;
  disabled?: boolean;
  // Spinner in place of the label, same shape -- so a "saving" state
  // doesn't swap in a differently-shaped placeholder.
  loading?: boolean;
  // md: a sheet's bottom actions. sm: inline confirm rows and strips
  // (delete confirm, 미분류 "AI로 정리") -- same shape, shorter.
  size?: 'md' | 'sm';
}

const HEIGHT = { md: 52, sm: 38 } as const;
const LABEL_SIZE = { md: 15, sm: 13.5 } as const;

// The sheet's bottom actions (취소/저장, 닫기/링크 열기 ...), one look per
// concept:
// - line: the original pill -- thin ink outline, primary filled ink -- so it
//   matches the other pill buttons on screen (e.g. 미분류함's action)
// - border: outlined pill, primary filled
// - layer: soft filled block, primary sits on a darker sheet and sinks when pressed
// - vintage: typewriter-labelled index tabs, primary is a tilted ink stamp
export function GhostButton({ label, onPress, theme, flex = 1, disabled = false, size = 'md' }: ButtonProps) {
  const concept = conceptOf(theme);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.base, { minHeight: HEIGHT[size], flex, opacity: disabled ? 0.5 : pressed ? 0.6 : 1 }, GHOST[concept](theme)]}
    >
      <Text
        style={[
          { fontSize: LABEL_SIZE[size] },
          concept === 'vintage' && styles.typed,
          concept === 'vintage' && size === 'sm' && styles.typedSm,
          { color: theme.ink, fontFamily: concept === 'vintage' ? MONO : 'IBMPlexSansKR_400Regular' },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

// variant 'danger': the destructive confirm (삭제/영구 삭제/탈퇴) -- same
// shape per concept, filled with theme.danger instead of the primary color.
export function SolidButton({
  label,
  onPress,
  theme,
  flex = 1.1,
  disabled = false,
  loading = false,
  size = 'md',
  variant = 'primary',
}: ButtonProps & { variant?: 'primary' | 'danger' }) {
  const concept = conceptOf(theme);
  const danger = variant === 'danger';
  const textColor = danger ? theme.bg : concept === 'vintage' ? theme.onAccent : theme.bg;
  const button = (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        { minHeight: HEIGHT[size], opacity: disabled ? 0.5 : 1 },
        concept === 'layer' ? { flex: 1 } : { flex },
        SOLID[concept](theme),
        danger && { backgroundColor: theme.danger },
        pressed && (concept === 'layer' ? styles.sunk : { opacity: 0.75 }),
      ]}
    >
      {concept === 'vintage' && <View pointerEvents="none" style={[styles.stampInner, { borderColor: textColor, opacity: 0.75 }]} />}
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <Text
          style={[
            { fontSize: LABEL_SIZE[size] },
            concept === 'vintage' && styles.typed,
            concept === 'vintage' && size === 'sm' && styles.typedSm,
            { color: textColor, fontFamily: concept === 'vintage' ? MONO : 'IBMPlexSansKR_500Medium', fontWeight: '500' },
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
  if (concept !== 'layer') return button;
  // The darker sheet behind the primary button -- a plain offset View, like
  // the list cards' back layer (no elevation).
  return (
    <View style={{ flex, marginRight: 4, marginBottom: 4 }}>
      <View pointerEvents="none" style={[styles.backLayer, { backgroundColor: theme.cardStack, borderRadius: theme.btnRadius }]} />
      {button}
    </View>
  );
}

// Row wrapper for a sheet's bottom actions. Vintage adds its dashed
// perforation above, like the tear-off edge of a card.
export function ButtonRow({ theme, style, children }: { theme: Theme; style?: ViewStyle; children: React.ReactNode }) {
  const vintage = conceptOf(theme) === 'vintage';
  return (
    <View style={style}>
      {vintage && <DashedRule color={theme.sub} style={styles.perforation} />}
      <View style={styles.row}>{children}</View>
    </View>
  );
}

const GHOST: Record<ReturnType<typeof conceptOf>, (t: Theme) => ViewStyle> = {
  line: (t) => ({ ...allEdges(OUTLINE, t.ink), borderRadius: t.btnRadius, backgroundColor: 'transparent' }),
  border: (t) => ({ ...allEdges(OUTLINE, t.line), borderRadius: t.btnRadius, backgroundColor: t.surface }),
  layer: (t) => ({ ...allEdges(0, 'transparent'), backgroundColor: t.bg, borderRadius: t.btnRadius }),
  vintage: (t) => ({ ...allEdges(OUTLINE, t.ink), borderRadius: t.btnRadius, backgroundColor: t.bg }),
};

const SOLID: Record<ReturnType<typeof conceptOf>, (t: Theme) => ViewStyle> = {
  line: (t) => ({ backgroundColor: t.ink, borderRadius: t.btnRadius }),
  border: (t) => ({ backgroundColor: t.ink, borderRadius: t.btnRadius }),
  layer: (t) => ({ backgroundColor: t.ink, borderRadius: t.btnRadius }),
  vintage: (t) => ({ backgroundColor: t.accent, borderRadius: t.btnRadius, transform: [{ rotate: '-1.2deg' }] }),
};

const styles = StyleSheet.create({
  base: { minHeight: 52, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  typed: { fontSize: 14, letterSpacing: 0.6 },
  typedSm: { fontSize: 12.5 },
  row: { flexDirection: 'row', gap: 10 },
  perforation: { marginBottom: 14 },
  backLayer: { position: 'absolute', top: 4, left: 4, right: -4, bottom: -4 },
  sunk: { transform: [{ translateX: 3 }, { translateY: 3 }] },
  // Inner rule of the "stamp" (in the label color) -- reads as a double border.
  stampInner: { position: 'absolute', top: 3, left: 3, right: 3, bottom: 3, borderWidth: 1, borderRadius: 2 },
});
