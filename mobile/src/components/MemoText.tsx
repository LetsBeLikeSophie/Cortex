import React from 'react';
import { StyleSheet, Text, TextStyle, View } from 'react-native';
import type { Theme } from '../theme/themes';

// Renders the small markdown subset 모아서 만들기 writes, so a long text-only
// memo reads in sections instead of one wall of text:
//   ## Section            -> a heading line
//   - item / • item       -> a bullet
//   1. item               -> a numbered line
//   **name**              -> bold, inline
//   blank line            -> a gap
// Anything else is a plain paragraph line. Unknown syntax is shown as typed.

function inline(text: string, theme: Theme, base: TextStyle) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map((part, i) =>
    part.startsWith('**') && part.endsWith('**') && part.length > 4 ? (
      <Text key={i} style={[base, styles.bold, { color: theme.ink }]}>
        {part.slice(2, -2)}
      </Text>
    ) : (
      <Text key={i}>{part}</Text>
    )
  );
}

export function MemoText({ text, theme, style }: { text: string; theme: Theme; style: TextStyle }) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  return (
    <View>
      {lines.map((raw, i) => {
        const line = raw.trimEnd();
        if (!line.trim()) return <View key={i} style={styles.gap} />;
        const heading = line.match(/^#{1,3}\s+(.*)$/);
        if (heading) {
          return (
            <Text key={i} style={[style, styles.heading, { color: theme.ink }, i > 0 && styles.headingSpace]}>
              {heading[1].replace(/\*\*/g, '')}
            </Text>
          );
        }
        const bullet = line.match(/^\s*[-•*]\s+(.*)$/);
        if (bullet) {
          return (
            <View key={i} style={styles.row}>
              <Text style={[style, { color: theme.sub }]}>•</Text>
              <Text style={[style, styles.rowText]}>{inline(bullet[1], theme, style)}</Text>
            </View>
          );
        }
        const numbered = line.match(/^\s*(\d+)[.)]\s+(.*)$/);
        if (numbered) {
          return (
            <View key={i} style={styles.row}>
              <Text style={[style, { color: theme.sub }]}>{numbered[1]}.</Text>
              <Text style={[style, styles.rowText]}>{inline(numbered[2], theme, style)}</Text>
            </View>
          );
        }
        return (
          <Text key={i} style={style}>
            {inline(line, theme, style)}
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
  row: { flexDirection: 'row', gap: 8, paddingLeft: 2 },
  rowText: { flex: 1 },
});
