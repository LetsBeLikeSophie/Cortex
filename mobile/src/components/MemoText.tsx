import React from 'react';
import { StyleSheet, Text, TextStyle, View } from 'react-native';
import type { Theme } from '../theme/themes';

// Renders the small markdown subset 모아서 만들기 writes, so a long text-only
// memo reads in sections instead of one wall of text:
//   ## Section            -> a heading line
//   - item / • item       -> a bullet
//   1. item               -> a numbered line
//   **name**              -> bold, inline
//   **name**[#3] / [#3]   -> a link to source item #3 (onRef); without onRef
//                            the reference is just hidden
//   blank line            -> a gap
// Anything else is a plain paragraph line. Unknown syntax is shown as typed.

const TOKEN = /(\*\*[^*]+\*\*(?:\[#\d+\])?|\[#\d+\])/g;

export function refsIn(text: string): Set<number> {
  const out = new Set<number>();
  for (const m of text.matchAll(/\[#(\d+)\]/g)) out.add(Number(m[1]));
  return out;
}

type Props = {
  text: string;
  theme: Theme;
  style: TextStyle;
  // Tapping a reference: open source item n (1-based, the compose order).
  onRef?: (n: number) => void;
  // Where each referenced item's line sits (y within this view), so a list
  // elsewhere can scroll the memo to it.
  onRefLayout?: (n: number, y: number) => void;
};

export function MemoText({ text, theme, style, onRef, onRefLayout }: Props) {
  const inline = (line: string) =>
    line
      .split(TOKEN)
      .filter(Boolean)
      .map((part, i) => {
        const bold = part.match(/^\*\*([^*]+)\*\*(?:\[#(\d+)\])?$/);
        const ref = part.match(/^\[#(\d+)\]$/);
        if (bold) {
          const n = bold[2] ? Number(bold[2]) : null;
          const linked = n !== null && !!onRef;
          return (
            <Text
              key={i}
              onPress={linked ? () => onRef!(n!) : undefined}
              style={[style, styles.bold, { color: theme.ink }, linked && styles.link]}
            >
              {bold[1]}
              {linked ? ' ↗' : ''}
            </Text>
          );
        }
        if (ref) {
          if (!onRef) return null;
          const n = Number(ref[1]);
          return (
            <Text key={i} onPress={() => onRef(n)} style={[style, { color: theme.sub }]}>
              {' ↗'}
            </Text>
          );
        }
        return <Text key={i}>{part}</Text>;
      });

  const lines = text.replace(/\r\n/g, '\n').split('\n');
  return (
    <View>
      {lines.map((raw, i) => {
        const line = raw.trimEnd();
        const refs = onRefLayout ? [...refsIn(line)] : [];
        const layout = refs.length ? { onLayout: (e: { nativeEvent: { layout: { y: number } } }) => refs.forEach((n) => onRefLayout!(n, e.nativeEvent.layout.y)) } : null;
        if (!line.trim()) return <View key={i} style={styles.gap} />;
        const heading = line.match(/^#{1,3}\s+(.*)$/);
        if (heading) {
          return (
            <Text key={i} {...layout} style={[style, styles.heading, { color: theme.ink }, i > 0 && styles.headingSpace]}>
              {heading[1].replace(/\*\*/g, '').replace(/\[#\d+\]/g, '')}
            </Text>
          );
        }
        const bullet = line.match(/^\s*[-•*]\s+(.*)$/);
        if (bullet) {
          return (
            <View key={i} {...layout} style={styles.row}>
              <Text style={[style, { color: theme.sub }]}>•</Text>
              <Text style={[style, styles.rowText]}>{inline(bullet[1])}</Text>
            </View>
          );
        }
        const numbered = line.match(/^\s*(\d+)[.)]\s+(.*)$/);
        if (numbered) {
          return (
            <View key={i} {...layout} style={styles.row}>
              <Text style={[style, { color: theme.sub }]}>{numbered[1]}.</Text>
              <Text style={[style, styles.rowText]}>{inline(numbered[2])}</Text>
            </View>
          );
        }
        return (
          <Text key={i} {...layout} style={style}>
            {inline(line)}
          </Text>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  gap: { height: 8 },
  heading: { fontFamily: 'IBMPlexSansKR_500Medium' },
  headingSpace: { marginTop: 6 },
  bold: { fontFamily: 'IBMPlexSansKR_500Medium' },
  link: { textDecorationLine: 'underline' },
  row: { flexDirection: 'row', gap: 8, paddingLeft: 2 },
  rowText: { flex: 1 },
});
