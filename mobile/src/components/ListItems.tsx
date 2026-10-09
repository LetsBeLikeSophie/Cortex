import React from 'react';
import { Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Theme, emToTracking, MONO } from '../theme/themes';
import { HighlightText } from './HighlightText';
import { RecentItem, SearchResult } from '../data/content';
import { captureTypeLabel } from '../api/format';
import { SourceIcon, CheckIcon } from './Icons';
import { LayeredBack } from './Decor';

// e.g. "▶ 링크 · 3분전" -- the channel reads as its icon (a text label per
// source would crowd this line), the method and time stay as text.
function MetaLine({
  item,
  theme,
  tech,
}: {
  item: Pick<RecentItem, 'source' | 'captureType' | 'timeLabel'>;
  theme: Theme;
  tech: boolean;
}) {
  return (
    <View style={styles.metaLine}>
      <SourceIcon source={item.source} size={11} color={theme.sub} strokeWidth={1.3} />
      <Text
        style={{
          fontFamily: tech ? MONO : 'IBMPlexSansKR_400Regular',
          fontSize: tech ? 10.5 : 12.5,
          letterSpacing: tech ? emToTracking(0.1, 10.5) : emToTracking(0.01, 12.5),
          color: theme.sub,
        }}
      >
        {captureTypeLabel(item.captureType, tech)} · {item.timeLabel}
      </Text>
    </View>
  );
}

// No shadow/elevation anywhere in here -- 'card' (retired) is what caused
// the Android "shadow rounded, content square" rendering bug, by pairing
// elevation with overflow:hidden. 'bordered' is a plain 1px border, which
// never needed elevation in the first place. 'layered' only returns the
// FRONT card's fill; the second, offset back card is a sibling View added
// in RecentRow/ResultRow themselves (LayeredBack in Decor.tsx), since a
// single ViewStyle object can't describe two stacked Views.
function cardShellStyle(theme: Theme): ViewStyle {
  switch (theme.list) {
    case 'line':
      return { borderBottomWidth: 1, borderBottomColor: theme.soft, paddingVertical: 20 };
    case 'bordered':
      return {
        backgroundColor: theme.surface,
        borderWidth: 1,
        borderColor: theme.line,
        borderRadius: theme.cardRadius,
        padding: 15,
        paddingHorizontal: 17,
        marginBottom: 9,
      };
    case 'layered':
      return {
        backgroundColor: theme.cardBg,
        borderRadius: theme.cardRadius,
        padding: 15,
        paddingHorizontal: 17,
      };
    case 'card':
      return {
        backgroundColor: theme.surface,
        borderWidth: theme.surfaceEdge ? 1 : 0,
        borderColor: theme.surfaceEdge ?? undefined,
        borderRadius: theme.cardRadius,
        padding: 15,
        paddingHorizontal: 17,
        marginBottom: 10,
      };
  }
}

// The layered list's back card -- same radius as the front, offset 6px
// down-right, rendered as an earlier sibling (not a ::before/z-index
// trick) so it paints behind the front card purely through JSX order, the
// same two-plain-Views approach verified safe in the design-preview
// artifact.
const LAYERED_BACK_OFFSET: ViewStyle = { position: 'absolute', top: 6, left: 6, right: -6, bottom: -6 };

export function RecentRow({
  item,
  theme,
  tech,
  onPress,
  selectMode = false,
  selected = false,
}: {
  item: RecentItem;
  theme: Theme;
  tech: boolean;
  onPress?: () => void;
  // Tag-filtered multi-select (bulk tag add/remove) -- a checkbox in front
  // of the row number instead of changing what tapping the row does, so the
  // row keeps reading the same way whether or not selection is active.
  selectMode?: boolean;
  selected?: boolean;
}) {
  const boxed = theme.list !== 'line';
  const layered = theme.list === 'layered';
  const row = (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [
        styles.row,
        { alignItems: boxed ? 'center' : 'baseline', opacity: pressed ? 0.6 : 1 },
        cardShellStyle(theme),
      ]}
    >
      {selectMode && (
        <View
          style={[
            styles.selectCircle,
            { borderColor: selected ? theme.accent : theme.line, backgroundColor: selected ? theme.accent : 'transparent' },
          ]}
        >
          {selected && <CheckIcon size={10} color="#fff" strokeWidth={2.4} />}
        </View>
      )}
      {/* key forces a full remount when the font family switches (line's
          italic serif vs every boxed layout's upright mono) -- Android can
          otherwise leave a custom-font Text blank after an in-place
          fontFamily change instead of repainting it. */}
      <Text
        key={boxed ? 'mono' : theme.headFamily}
        style={{
          fontFamily: boxed ? MONO : theme.headFamily,
          fontStyle: boxed ? 'normal' : 'italic',
          fontSize: boxed ? 11 : 17,
          color: theme.accent,
          minWidth: 24,
          paddingTop: boxed ? 2 : 0,
        }}
      >
        {item.no}
      </Text>
      <View style={styles.rowBody}>
        <Text style={[styles.title, { color: item.pending ? theme.sub : theme.ink, fontStyle: item.pending ? 'italic' : 'normal' }]}>
          {item.title}
        </Text>
        <View style={{ marginTop: 7 }}>
          <MetaLine item={item} theme={theme} tech={tech} />
        </View>
      </View>
    </Pressable>
  );

  if (!layered) return row;
  return (
    <View style={styles.layeredWrap}>
      <LayeredBack theme={theme} radius={theme.cardRadius} style={LAYERED_BACK_OFFSET} />
      {row}
    </View>
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
  const result = (
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
        text={item.title}
        terms={item.terms}
        accent={theme.accent}
        hitStyle={theme.hitStyle}
        baseStyle={[
          styles.title,
          { color: item.pending ? theme.sub : theme.ink, fontStyle: item.pending ? 'italic' : 'normal', opacity: trashed ? 0.6 : 1 },
        ]}
      />
      <HighlightText
        text={item.snippet}
        terms={item.terms}
        accent={theme.accent}
        hitStyle={theme.hitStyle}
        baseStyle={[styles.snippet, { color: theme.sub, opacity: trashed ? 0.6 : 1 }]}
      />
      <View style={styles.resultFooter}>
        <View style={[styles.resultFooterLeft, { opacity: trashed ? 0.6 : 1 }]}>
          <MetaLine item={item} theme={theme} tech={tech} />
          {item.missingTerms.length > 0 && (
            <View style={[styles.missingBadge, { borderColor: theme.sub }]}>
              <Text style={{ fontSize: 11.5, color: theme.sub, fontFamily: 'IBMPlexSansKR_400Regular' }}>
                {item.missingTerms.join(', ')} 없음
              </Text>
            </View>
          )}
        </View>
        {trashed && (
          <Pressable onPress={onRestore} hitSlop={8} style={[styles.restoreButton, { borderColor: theme.line }]}>
            <Text style={{ fontSize: 12.5, color: theme.ink, fontFamily: 'IBMPlexSansKR_500Medium' }}>복원</Text>
          </Pressable>
        )}
      </View>
    </Pressable>
  );

  if (theme.list !== 'layered') return result;
  return (
    <View style={styles.layeredWrap}>
      <LayeredBack theme={theme} radius={theme.cardRadius} style={LAYERED_BACK_OFFSET} />
      {result}
    </View>
  );
}

const styles = StyleSheet.create({
  layeredWrap: { position: 'relative', marginBottom: 16 },
  row: { flexDirection: 'row', gap: 13 },
  selectCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: { flex: 1, minWidth: 0 },
  metaLine: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  title: { fontSize: 15.5, lineHeight: 22.5, fontFamily: 'IBMPlexSansKR_400Regular' },
  snippet: { fontSize: 13, marginTop: 7, lineHeight: 20.8, fontFamily: 'IBMPlexSansKR_400Regular' },
  trashBadge: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, marginBottom: 8 },
  resultFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 7 },
  resultFooterLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  missingBadge: { borderWidth: 1, borderStyle: 'dashed', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  restoreButton: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 },
});
