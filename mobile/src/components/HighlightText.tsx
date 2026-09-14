import React from 'react';
import { StyleSheet, Text, TextStyle, StyleProp } from 'react-native';
import { HitStyle } from '../theme/themes';

interface Props {
  hit: string;
  rest: string;
  accent: string;
  hitStyle: HitStyle;
  baseStyle: StyleProp<TextStyle>;
}

// Three ways a search match can be called out, one per theme family:
// a highlighter-marker wash, an underline, or a small pill chip.
export function HighlightText({ hit, rest, accent, hitStyle, baseStyle }: Props) {
  const baseColor = (StyleSheet.flatten(baseStyle) as TextStyle | undefined)?.color;
  const hitTextStyle: TextStyle =
    hitStyle === 'underline'
      ? { color: accent, borderBottomWidth: 1, borderBottomColor: accent }
      : hitStyle === 'chip'
      ? { backgroundColor: accent + '26', borderRadius: 4, paddingHorizontal: 4, color: baseColor }
      : { backgroundColor: accent + '3d', color: baseColor };

  return (
    <Text style={baseStyle}>
      <Text style={hitTextStyle}>{hit}</Text>
      {rest}
    </Text>
  );
}
