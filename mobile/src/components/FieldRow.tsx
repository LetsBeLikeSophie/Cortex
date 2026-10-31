import React from 'react';
import { StyleProp, StyleSheet, TextStyle, View, ViewStyle } from 'react-native';
import { BODY_KR, Theme } from '../theme/themes';
import { fieldStyle } from './Fields';

const LINE = 22;

// Every place to type: the field's edge sits right under the text, and the
// mic stays on the first line at the right. fieldStyle goes on this View, not
// on the TextInput: Android left out a one-sided border on a TextInput.
export function FieldRow({
  theme,
  mic,
  style,
  children,
}: {
  theme: Theme;
  mic?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  return (
    <View style={[styles.row, fieldStyle(theme), style]}>
      <View style={styles.input}>{children}</View>
      {mic && <View style={styles.mic}>{mic}</View>}
    </View>
  );
}

// For the TextInput inside; add the color.
export const fieldTextStyle: TextStyle = {
  padding: 0,
  fontSize: 14,
  lineHeight: LINE,
  fontFamily: BODY_KR,
  textAlignVertical: 'top',
  includeFontPadding: false,
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingHorizontal: 14, paddingVertical: 9 },
  input: { flex: 1 },
  // One line tall however big the button is; its own padding hangs past the
  // field's end, so the icon lines up with the edge of the text area.
  mic: { height: LINE, justifyContent: 'center', marginRight: -8 },
});
