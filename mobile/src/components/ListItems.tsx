import React from 'react';
import { Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
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

export function RecentRow({
  item,
  theme,
  tech,
  onPress,
}: {
  item: RecentItem;
  theme: Theme;
  tech: boolean;
  onPress?: () => void;
}) {
  const card = theme.list === 'card';
  const meta = tech ? item.metaTech : item.metaPlain;
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [
        styles.row,
        { alignItems: card ? 'center' : 'baseline', opacity: pressed ? 0.6 : 1 },
        cardShellStyle(theme),
      ]}
    >
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
    </Pressable>
  );
}

// `trashed` + `onRestore` mark a result that's currently in the trash --
// search deliberately includes those (see searchItems in supabase.ts), so
// a hit needs to read as "found, but it's in the trash" rather than look
// like a normal, openable item. Tapping the row does nothing in that case;
// restoring is the only action offered.
export function ResultRow({
  item,
  theme,
  tech,
  onPress,
  trashed,
  onRestore,
}: {
  item: SearchResult;
  theme: Theme;
  tech: boolean;
  onPress?: () => void;
  trashed?: boolean;
  onRestore?: () => void;
}) {
  const meta = tech ? item.metaTech : item.metaPlain;
  return (
    <Pressable
      onPress={trashed ? undefined : onPress}
      disabled={trashed || !onPress}
      style={({ pressed }) => [cardShellStyle(theme), { opacity: pressed && !trashed ? 0.6 : 1 }]}
    >
      {trashed && (
        <View style={[styles.trashBadge, { backgroundColor: theme.soft }]}>
          <Text style={{ fontSize: 11, color: theme.sub, fontFamily: 'IBMPlexSansKR_500Medium' }}>휴지통에 있음</Text>
        </View>
      )}
      <HighlightText
        before={item.before}
        hit={item.hit}
        after={item.after}
        accent={theme.accent}
        hitStyle={theme.hitStyle}
        baseStyle={[styles.title, { color: theme.ink, opacity: trashed ? 0.6 : 1 }]}
      />
      <Text style={[styles.snippet, { color: theme.sub, opacity: trashed ? 0.6 : 1 }]}>{item.snippet}</Text>
      <View style={styles.resultFooter}>
        <Text
          style={{
            fontFamily: tech ? MONO : 'IBMPlexSansKR_400Regular',
            fontSize: tech ? 10.5 : 12.5,
            letterSpacing: tech ? emToTracking(0.1, 10.5) : emToTracking(0.01, 12.5),
            color: theme.sub,
          }}
        >
          {meta}
        </Text>
        {trashed && (
          <Pressable onPress={onRestore} hitSlop={8} style={[styles.restoreButton, { borderColor: theme.line }]}>
            <Text style={{ fontSize: 12.5, color: theme.ink, fontFamily: 'IBMPlexSansKR_500Medium' }}>복원</Text>
          </Pressable>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 13 },
  rowBody: { flex: 1, minWidth: 0 },
  title: { fontSize: 15.5, lineHeight: 22.5, fontFamily: 'IBMPlexSansKR_400Regular' },
  snippet: { fontSize: 13, marginTop: 7, lineHeight: 20.8, fontFamily: 'IBMPlexSansKR_400Regular' },
  trashBadge: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, marginBottom: 8 },
  resultFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 7 },
  restoreButton: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 },
});
