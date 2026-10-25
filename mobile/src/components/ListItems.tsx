import React from 'react';
import { Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Theme, emToTracking, MONO, OUTLINE, allEdges, bottomEdge, SERIF } from '../theme/themes';
import { HighlightText } from './HighlightText';
import { RecentItem, SearchResult } from '../data/content';
import { captureTypeLabel } from '../api/format';
import { SourceIcon, CheckIcon, LockIcon } from './Icons';
import { LayeredBack } from './Decor';
import { LAYERED_BACK_OFFSET, cardShellStyle } from './Card';
import { strings } from '../i18n';

const S = strings({
  ko: { inTrash: '휴지통에 있음', missing: (terms: string) => `${terms} 없음`, restore: '복원' },
  en: { inTrash: 'In trash', missing: (terms: string) => `No ${terms}`, restore: 'Restore' },
  ja: { inTrash: 'ゴミ箱にあります', missing: (terms: string) => `${terms} なし`, restore: '復元' },
  'zh-Hans': { inTrash: '在回收站', missing: (terms: string) => `无 ${terms}`, restore: '恢复' },
  'zh-Hant': { inTrash: '在垃圾桶', missing: (terms: string) => `無 ${terms}`, restore: '還原' },
});

// e.g. "▶ 링크 · 3분전" -- the channel reads as its icon (a text label per
// source would crowd this line), the method and time stay as text.
function MetaLine({
  item,
  theme,
}: {
  item: Pick<RecentItem, 'source' | 'captureType' | 'timeLabel'>;
  theme: Theme;
}) {
  return (
    <View style={styles.metaLine}>
      <SourceIcon source={item.source} size={11} color={theme.sub} strokeWidth={1.3} />
      <Text
        style={{
          fontFamily: 'IBMPlexSansKR_400Regular',
          fontSize: 12.5,
          letterSpacing: emToTracking(0.01, 12.5),
          color: theme.sub,
        }}
      >
        {captureTypeLabel(item.captureType, false)} · {item.timeLabel}
      </Text>
    </View>
  );
}

// Pressed feedback. Fading the row (opacity) works for every flat layout,
// but on 'layered' it turns the front card see-through and the back card
// shows through it like a ghost -- so there the front card instead sinks
// halfway toward the back one, a "pressed into the stack" cue that keeps
// both layers opaque.
export function pressedStyle(theme: Theme, pressed: boolean): ViewStyle {
  if (!pressed) return {};
  if (theme.list === 'layered') return { transform: [{ translateX: 3 }, { translateY: 3 }] };
  return { opacity: 0.6 };
}

export function RecentRow({
  item,
  theme,
  onPress,
  selectMode = false,
  selected = false,
}: {
  item: RecentItem;
  theme: Theme;
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
        { alignItems: boxed ? 'center' : 'baseline' },
        cardShellStyle(theme),
        pressedStyle(theme, pressed),
      ]}
    >
      {selectMode && (
        <View
          style={[
            styles.selectCircle,
            { borderColor: selected ? theme.ink : theme.line, backgroundColor: selected ? theme.ink : 'transparent' },
          ]}
        >
          {selected && <CheckIcon size={10} color={theme.bg} strokeWidth={2.4} />}
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
          // The italic numeral belongs to the serif; a sans heading stays upright.
          fontStyle: !boxed && theme.headFamily === SERIF ? 'italic' : 'normal',
          fontSize: boxed ? 11 : 17,
          color: theme.accent,
          minWidth: 24,
          paddingTop: boxed ? 2 : 0,
        }}
      >
        {item.no}
      </Text>
      <View style={styles.rowBody}>
        <View style={styles.titleLine}>
          {/* The line icon, not the 🔒 emoji -- an emoji ignores the theme's color. */}
          {item.locked && <LockIcon size={12} color={theme.sub} strokeWidth={1.4} />}
          <Text style={[styles.title, styles.titleText, { color: item.pending ? theme.sub : theme.ink, fontStyle: item.pending ? 'italic' : 'normal' }]}>
            {item.composed ? <Text style={{ color: theme.accent }}>✦ </Text> : null}
            {item.title}
          </Text>
        </View>
        <View style={{ marginTop: 7 }}>
          <MetaLine item={item} theme={theme} />
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
  onPress,
  trashed,
  onRestore,
}: {
  item: SearchResult;
  theme: Theme;
  onPress?: () => void;
  trashed?: boolean;
  onRestore?: () => void;
}) {
  const result = (
    <Pressable
      onPress={trashed ? undefined : onPress}
      disabled={trashed || !onPress}
      style={({ pressed }) => [cardShellStyle(theme), pressedStyle(theme, pressed && !trashed)]}
    >
      {trashed && (
        <View style={[styles.trashBadge, { backgroundColor: theme.soft }]}>
          <Text style={{ fontSize: 11, color: theme.sub, fontFamily: 'IBMPlexSansKR_500Medium' }}>{S.inTrash}</Text>
        </View>
      )}
      <View style={[styles.titleLine, { opacity: trashed ? 0.6 : 1 }]}>
        {item.locked && <LockIcon size={12} color={theme.sub} strokeWidth={1.4} />}
        <HighlightText
          text={item.title}
          terms={item.terms}
          accent={theme.accent}
          baseStyle={[styles.title, styles.titleText, { color: item.pending ? theme.sub : theme.ink, fontStyle: item.pending ? 'italic' : 'normal' }]}
        />
      </View>
      {/* A locked memo has no preview -- no empty line where one would be. */}
      {item.snippet !== '' && (
        <HighlightText
          text={item.snippet}
          terms={item.terms}
          accent={theme.accent}
          baseStyle={[styles.snippet, { color: theme.sub, opacity: trashed ? 0.6 : 1 }]}
        />
      )}
      <View style={styles.resultFooter}>
        <View style={[styles.resultFooterLeft, { opacity: trashed ? 0.6 : 1 }]}>
          <MetaLine item={item} theme={theme} />
          {item.missingTerms.length > 0 && (
            <View style={[styles.missingBadge, { borderColor: theme.sub }]}>
              <Text style={{ fontSize: 11.5, color: theme.sub, fontFamily: 'IBMPlexSansKR_400Regular' }}>
                {S.missing(item.missingTerms.join(', '))}
              </Text>
            </View>
          )}
        </View>
        {trashed && (
          <Pressable onPress={onRestore} hitSlop={8} style={[styles.restoreButton, { borderColor: theme.line }]}>
            <Text style={{ fontSize: 12.5, color: theme.ink, fontFamily: 'IBMPlexSansKR_500Medium' }}>{S.restore}</Text>
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
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  titleText: { flexShrink: 1 },
  snippet: { fontSize: 13, marginTop: 7, lineHeight: 20.8, fontFamily: 'IBMPlexSansKR_400Regular' },
  trashBadge: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, marginBottom: 8 },
  resultFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 7 },
  resultFooterLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  missingBadge: { borderWidth: 1, borderStyle: 'dashed', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  restoreButton: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 },
});
