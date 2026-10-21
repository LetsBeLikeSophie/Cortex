import React from 'react';
import { StyleSheet, Text, TextStyle, StyleProp } from 'react-native';

interface Props {
  text: string;
  terms: string[];
  accent: string;
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

// A search match gets a highlighter-marker wash in the accent.
export function HighlightText({ text, terms, accent, baseStyle }: Props) {
  const baseColor = (StyleSheet.flatten(baseStyle) as TextStyle | undefined)?.color;
  const hitTextStyle: TextStyle = { backgroundColor: accent + '3d', color: baseColor };

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
