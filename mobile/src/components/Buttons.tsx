import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { MONO, OUTLINE, Theme, conceptOf } from '../theme/themes';
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
}

// The sheet's bottom actions (취소/저장, 닫기/링크 열기 ...), one look per
// concept:
// - line: square-cornered, hairline-outlined (same light rule colour as the
//   home screen's dividers), primary filled ink -- editorial, but clearly a
//   button; the earlier "text over a heavy black rule" read as a divider
// - border: outlined pill, primary filled
// - layer: soft filled block, primary sits on a darker sheet and sinks when pressed
// - vintage: typewriter-labelled index tabs, primary is a tilted ink stamp
export function GhostButton({ label, onPress, theme, flex = 1, disabled = false }: ButtonProps) {
  const concept = conceptOf(theme);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.base, { flex, opacity: disabled ? 0.5 : pressed ? 0.6 : 1 }, GHOST[concept](theme)]}
    >
      <Text
        style={[
          styles.label,
          concept === 'vintage' && styles.typed,
          { color: theme.ink, fontFamily: concept === 'vintage' ? MONO : 'IBMPlexSansKR_400Regular' },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function SolidButton({ label, onPress, theme, flex = 1.1, disabled = false, loading = false }: ButtonProps) {
  const concept = conceptOf(theme);
  const textColor = concept === 'vintage' ? '#fff' : theme.bg;
  const button = (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        { opacity: disabled ? 0.5 : 1 },
        concept === 'layer' ? { flex: 1 } : { flex },
        SOLID[concept](theme),
        pressed && (concept === 'layer' ? styles.sunk : { opacity: 0.75 }),
      ]}
    >
      {concept === 'vintage' && <View pointerEvents="none" style={styles.stampInner} />}
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <Text
          style={[
            styles.label,
            concept === 'vintage' && styles.typed,
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
      <View pointerEvents="none" style={[styles.backLayer, { backgroundColor: theme.cardStack, borderRadius: 14 }]} />
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
  line: (t) => ({ borderWidth: OUTLINE, borderColor: t.line, borderRadius: 0, backgroundColor: 'transparent' }),
  border: (t) => ({ borderWidth: OUTLINE, borderColor: t.line, borderRadius: 999, backgroundColor: t.surface }),
  layer: (t) => ({ backgroundColor: t.bg, borderRadius: 14 }),
  vintage: (t) => ({ borderWidth: OUTLINE, borderColor: t.ink, borderRadius: 3, backgroundColor: t.bg }),
};

const SOLID: Record<ReturnType<typeof conceptOf>, (t: Theme) => ViewStyle> = {
  line: (t) => ({ backgroundColor: t.ink, borderRadius: 0 }),
  border: (t) => ({ backgroundColor: t.ink, borderRadius: 999 }),
  layer: (t) => ({ backgroundColor: t.ink, borderRadius: 14 }),
  vintage: (t) => ({ backgroundColor: t.accent, borderRadius: 3, transform: [{ rotate: '-1.2deg' }] }),
};

const styles = StyleSheet.create({
  base: { minHeight: 52, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 15 },
  typed: { fontSize: 14, letterSpacing: 0.6 },
  row: { flexDirection: 'row', gap: 10 },
  perforation: { marginBottom: 14 },
  backLayer: { position: 'absolute', top: 4, left: 4, right: -4, bottom: -4 },
  sunk: { transform: [{ translateX: 3 }, { translateY: 3 }] },
  // Inner white rule of the "stamp" -- reads as a double border.
  stampInner: { position: 'absolute', top: 3, left: 3, right: 3, bottom: 3, borderWidth: 1, borderColor: 'rgba(255,255,255,0.75)', borderRadius: 2 },
});
