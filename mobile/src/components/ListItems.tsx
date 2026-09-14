import React from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Theme, emToTracking, MONO } from '../theme/themes';
import { HighlightText } from './HighlightText';
import { RecentItem, SearchResult } from '../data/content';

function cardShellStyle(theme: Theme): ViewStyle {
  const card = theme.list === 'card';
  if (!card) {
    return { borderBottomWidth: 1, borderBottomColor: theme.soft, paddingVertical: 20 };
  }
  return {
    backgroundColor: theme.surface,
    borderWidth: theme.surfaceEdge ? 1 : 0,
    borderColor: theme.surfaceEdge ?? undefined,
    borderRadius: theme.cardRadius,
    padding: 15,
    paddingHorizontal: 17,
    marginBottom: 10,
    ...(theme.dark
      ? null
      : { shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 1 }),
  };
}

export function RecentRow({ item, theme, tech }: { item: RecentItem; theme: Theme; tech: boolean }) {
  const card = theme.list === 'card';
  const meta = tech ? item.metaTech : item.metaPlain;
  return (
    <View style={[styles.row, { alignItems: card ? 'center' : 'baseline' }, cardShellStyle(theme)]}>
      <Text
        style={{
          fontFamily: card ? MONO : theme.headFamily,
          fontStyle: card ? 'normal' : 'italic',
          fontSize: card ? 11 : 17,
          color: theme.accent,
          minWidth: 24,
          paddingTop: card ? 2 : 0,
        }}
      >
        {item.no}
      </Text>
      <View style={styles.rowBody}>
        <Text style={[styles.title, { color: theme.ink }]}>{item.title}</Text>
        <Text
          style={{
            fontFamily: tech ? MONO : 'IBMPlexSansKR_400Regular',
            fontSize: tech ? 10.5 : 12.5,
            letterSpacing: tech ? emToTracking(0.1, 10.5) : emToTracking(0.01, 12.5),
            color: theme.sub,
            marginTop: 7,
          }}
        >
          {meta}
        </Text>
      </View>
    </View>
  );
}

export function ResultRow({ item, theme, tech }: { item: SearchResult; theme: Theme; tech: boolean }) {
  const meta = tech ? item.metaTech : item.metaPlain;
  return (
    <View style={cardShellStyle(theme)}>
      <HighlightText
        hit={item.hit}
        rest={item.rest}
        accent={theme.accent}
        hitStyle={theme.hitStyle}
        baseStyle={[styles.title, { color: theme.ink }]}
      />
      <Text style={[styles.snippet, { color: theme.sub }]}>{item.snippet}</Text>
      <Text
        style={{
          fontFamily: tech ? MONO : 'IBMPlexSansKR_400Regular',
          fontSize: tech ? 10.5 : 12.5,
          letterSpacing: tech ? emToTracking(0.1, 10.5) : emToTracking(0.01, 12.5),
          color: theme.sub,
          marginTop: 7,
        }}
      >
        {meta}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 13 },
  rowBody: { flex: 1, minWidth: 0 },
  title: { fontSize: 15.5, lineHeight: 22.5, fontFamily: 'IBMPlexSansKR_400Regular' },
  snippet: { fontSize: 13, marginTop: 7, lineHeight: 20.8, fontFamily: 'IBMPlexSansKR_400Regular' },
});
