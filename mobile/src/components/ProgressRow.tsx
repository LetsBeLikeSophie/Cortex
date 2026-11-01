import React from 'react';
import { ActivityIndicator, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';

import { Theme, BODY_KR } from '../theme/themes';

// The one way to say work is still going: a spinner and a short line.
export function ProgressRow({ theme, label, spinning = true, style }: { theme: Theme; label: string; spinning?: boolean; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.row, style]}>
      {spinning && <ActivityIndicator color={theme.accent} size="small" />}
      <Text style={[styles.text, { color: theme.sub }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  text: { flexShrink: 1, fontFamily: BODY_KR, fontSize: 12.5 },
});
