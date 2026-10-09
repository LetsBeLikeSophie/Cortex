import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import Svg, { Circle, Defs, G, Line, Pattern, Rect } from 'react-native-svg';
import { Theme } from '../theme/themes';

// Layout decoration ported from the "Cortex 스타일 프리뷰" design artifact's
// shadow-vintage style -- plain SVG patterns, no elevation/shadow anywhere,
// so it stays clear of the Android rendering bugs that retired 'card'.

function hexToRgb(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgba(hex: string, alpha: number, lightenBy = 0) {
  const { r, g, b } = hexToRgb(hex);
  const mix = (c: number) => Math.round(c + (255 - c) * lightenBy);
  return `rgba(${mix(r)},${mix(g)},${mix(b)},${alpha})`;
}

// Pattern ids are document-global on web, so they carry the color they were
// built with -- two palettes on screen at once (theme picker preview) never
// end up sharing one definition.
const idFor = (prefix: string, hex: string) => `${prefix}-${hex.replace('#', '')}`;

// Diagonal crosshatch at 10% accent behind the whole screen, like old
// wallpaper -- cards are opaque, so it only shows in the gaps between them.
// 18px tile ≈ the design's 13px perpendicular line spacing at 45°.
export function VintageWallpaper({ theme }: { theme: Theme }) {
  if (theme.decor !== 'vintage') return null;
  const id = idFor('cx-grid', theme.accent);
  const stroke = rgba(theme.accent, 0.1);
  return (
    <Svg width="100%" height="100%" style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <Pattern id={id} patternUnits="userSpaceOnUse" width={18} height={18}>
          <Line x1={0} y1={0} x2={18} y2={18} stroke={stroke} strokeWidth={1} />
          <Line x1={18} y1={0} x2={0} y2={18} stroke={stroke} strokeWidth={1} />
        </Pattern>
      </Defs>
      <Rect x={0} y={0} width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  );
}

// A layered card's back layer (the darker sliver peeking out bottom-right).
// Under the vintage decor it also carries a quatrefoil tile -- four
// overlapping circles in a lightened, semi-transparent accent, repeated
// twice with a half-tile brick offset, like tooling on an old book cover.
export function LayeredBack({
  theme,
  radius,
  style,
}: {
  theme: Theme;
  radius: number;
  style?: StyleProp<ViewStyle>;
}) {
  const vintage = theme.decor === 'vintage';
  const id = idFor('qf', theme.accent);
  return (
    <View
      pointerEvents="none"
      style={[{ backgroundColor: theme.cardStack, borderRadius: radius, overflow: vintage ? 'hidden' : 'visible' }, style]}
    >
      {vintage && (
        <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
          <Defs>
            <Pattern id={id} patternUnits="userSpaceOnUse" width={32} height={32}>
              <G fill={rgba(theme.accent, 0.32, 0.35)}>
                <Circle cx={16} cy={9} r={6} />
                <Circle cx={16} cy={23} r={6} />
                <Circle cx={9} cy={16} r={6} />
                <Circle cx={23} cy={16} r={6} />
              </G>
            </Pattern>
          </Defs>
          <Rect x={0} y={0} width="100%" height="100%" fill={`url(#${id})`} />
          <G transform="translate(16 16)">
            <Rect x={-16} y={-16} width="200%" height="200%" fill={`url(#${id})`} />
          </G>
        </Svg>
      )}
    </View>
  );
}
