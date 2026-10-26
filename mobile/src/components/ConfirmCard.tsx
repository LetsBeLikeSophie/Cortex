import React from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { OUTLINE, Theme, allEdges, conceptOf, BODY_KR, BODY_KR_MEDIUM } from '../theme/themes';
import { GhostButton, SolidButton } from './Buttons';
import { COMMON } from '../i18n/common';

// The one "are you sure?" for destructive actions -- item delete (detail),
// permanent delete (trash), account/guest delete (profile). Message, an
// optional error line, then 취소 + a danger button, all following the
// current concept's button and card shapes.
//
// `bare` drops the frame for when it already sits inside a card (a trash
// row); otherwise it draws its own: outlined in line/border/vintage, and in
// layer (no borders there) a faint danger-tinted fill, which also stands
// out on whatever surface the card lands on (page or sheet).
export function ConfirmCard({
  theme,
  title,
  body,
  confirmLabel,
  busy,
  error,
  onCancel,
  onConfirm,
  bare = false,
  children,
}: {
  theme: Theme;
  title: string;
  body?: string;
  confirmLabel: string;
  busy: boolean;
  error?: string;
  onCancel: () => void;
  onConfirm: () => void;
  bare?: boolean;
  // Extra lines under the message (a link to act on first, say).
  children?: React.ReactNode;
}) {
  return (
    <View style={[styles.card, !bare && frame(theme), bare && styles.bare]}>
      <Text style={[styles.title, { color: theme.ink }]}>{title}</Text>
      {body ? <Text style={[styles.body, { color: theme.sub }]}>{body}</Text> : null}
      {children}
      {error ? <Text style={[styles.error, { color: theme.danger }]}>{error}</Text> : null}
      <View style={styles.buttons}>
        <GhostButton label={COMMON.cancel} theme={theme} size="sm" onPress={onCancel} disabled={busy} />
        <SolidButton label={confirmLabel} theme={theme} size="sm" flex={1} variant="danger" onPress={onConfirm} loading={busy} />
      </View>
    </View>
  );
}

function frame(theme: Theme): ViewStyle {
  if (conceptOf(theme) === 'layer') {
    return { ...allEdges(0, 'transparent'), backgroundColor: theme.danger + '14', borderRadius: theme.cardRadius };
  }
  return { ...allEdges(OUTLINE, theme.line), backgroundColor: 'transparent', borderRadius: theme.cardRadius };
}

const styles = StyleSheet.create({
  card: { padding: 16, gap: 6, marginTop: 14 },
  bare: { padding: 0, marginTop: 4 },
  title: { fontSize: 14.5, fontFamily: BODY_KR_MEDIUM },
  body: { fontSize: 13, lineHeight: 19, fontFamily: BODY_KR },
  error: { fontSize: 12.5, marginTop: 2, fontFamily: BODY_KR },
  buttons: { flexDirection: 'row', gap: 10, marginTop: 10 },
});
