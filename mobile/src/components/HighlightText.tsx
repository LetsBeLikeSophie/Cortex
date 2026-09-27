import React from 'react';
import { StyleSheet, Text, TextStyle, StyleProp } from 'react-native';
import { HitStyle } from '../theme/themes';

interface Props {
  text: string;
  terms: string[];
  accent: string;
  hitStyle: HitStyle;
  baseStyle: StyleProp<TextStyle>;
}

interface Segment {
  text: string;
  hit: boolean;
}

// Walks `text` once, greedily matching the longest still-unconsumed term at
// each position (so e.g. "공부" doesn't shadow a longer overlapping term) --
// same approach as the search design's own segs() helper.
function buildSegments(text: string, terms: string[]): Segment[] {
  const words = [...new Set(terms)].filter(Boolean).sort((a, b) => b.length - a.length);
  if (words.length === 0 || !text) return [{ text, hit: false }];

  const lower = text.toLowerCase();
  const segments: Segment[] = [];
  let buf = '';
  let i = 0;
  while (i < text.length) {
    const match = words.find((w) => lower.startsWith(w.toLowerCase(), i));
    if (match) {
      if (buf) {
        segments.push({ text: buf, hit: false });
        buf = '';
      }
      segments.push({ text: text.slice(i, i + match.length), hit: true });
      i += match.length;
    } else {
      buf += text[i];
      i += 1;
    }
  }
  if (buf) segments.push({ text: buf, hit: false });
  return segments;
}

// Three ways a search match can be called out, one per theme family: a
// highlighter-marker wash, an underline, or a small pill chip.
export function HighlightText({ text, terms, accent, hitStyle, baseStyle }: Props) {
  const baseColor = (StyleSheet.flatten(baseStyle) as TextStyle | undefined)?.color;
  const hitTextStyle: TextStyle =
    hitStyle === 'underline'
      ? { color: accent, borderBottomWidth: 1, borderBottomColor: accent }
      : hitStyle === 'chip'
      ? { backgroundColor: accent + '26', borderRadius: 4, paddingHorizontal: 4, color: baseColor }
      : { backgroundColor: accent + '3d', color: baseColor };

  const segments = buildSegments(text, terms);
  return (
    <Text style={baseStyle}>
      {segments.map((seg, i) =>
        seg.hit ? (
          <Text key={i} style={hitTextStyle}>
            {seg.text}
          </Text>
        ) : (
          seg.text
        )
      )}
    </Text>
  );
}
