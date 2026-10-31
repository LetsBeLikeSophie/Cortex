import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { BODY_KR, BODY_KR_MEDIUM, OUTLINE, Theme, allEdges } from '../theme/themes';
import { COMMON } from '../i18n/common';
import { ButtonRow, GhostButton, SolidButton } from './Buttons';
import { sheetBackground } from './ModalSheet';

// 예/아니오 before an AI action that needs a word first: what it does, and
// nothing about the count (the Bubble says that). Destructive confirms are
// ConfirmCard.
export function ConfirmPopup({
  theme,
  title,
  body,
  onYes,
  onNo,
}: {
  theme: Theme;
  title: string;
  body: string;
  onYes: () => void;
  onNo: () => void;
}) {
  return (
    <Modal transparent statusBarTranslucent animationType="fade" onRequestClose={onNo}>
      <View style={styles.center}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: theme.dark ? 'rgba(4,5,7,0.5)' : 'rgba(20,20,15,0.28)' }]} onPress={onNo} />
        <View style={[styles.card, allEdges(OUTLINE, theme.line), { backgroundColor: sheetBackground(theme), borderRadius: theme.cardRadius }]}>
          <Text style={[styles.title, { color: theme.ink }]}>{title}</Text>
          <Text style={[styles.body, { color: theme.sub }]}>{body}</Text>
          <ButtonRow theme={theme} style={styles.buttons}>
            <GhostButton label={COMMON.no} theme={theme} size="sm" onPress={onNo} />
            <SolidButton label={COMMON.yes} theme={theme} size="sm" flex={1} onPress={onYes} />
          </ButtonRow>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  card: { alignSelf: 'stretch', padding: 20 },
  title: { fontSize: 16, fontFamily: BODY_KR_MEDIUM },
  body: { fontSize: 13.5, lineHeight: 20, marginTop: 8, fontFamily: BODY_KR },
  buttons: { marginTop: 18 },
});
