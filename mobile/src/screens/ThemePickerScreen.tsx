import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useTheme } from '../theme/ThemeContext';
import { THEME_ORDER, THEMES, ThemeKey } from '../theme/themes';
import { CheckIcon } from '../components/Icons';
import { ModalSheet } from '../components/ModalSheet';
import { Heading } from '../components/Typography';
import type { RootStackParamList } from '../navigation/types';

// The design's own top comparison bar (a chip strip to flip between the 5
// themes) reworked into the real in-app theme switcher.
export default function ThemePickerScreen() {
  const { theme, themeKey, setThemeKey } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const pick = (key: ThemeKey) => {
    setThemeKey(key);
    navigation.goBack();
  };

  return (
    <ModalSheet
      theme={theme}
      onClose={() => navigation.goBack()}
      animated={false}
      bordered={false}
      paddingBottom={24}
      paddingHorizontal={20}
      grabberMarginBottom={18}
    >
      <Heading theme={theme} size={20} style={styles.heading}>
        테마
      </Heading>

      {THEME_ORDER.map((key) => {
        const t = THEMES[key];
        const active = key === themeKey;
        return (
          <Pressable
            key={key}
            onPress={() => pick(key)}
            style={[styles.row, { borderColor: active ? theme.ink : theme.line, backgroundColor: active ? theme.soft : 'transparent' }]}
          >
            <View style={[styles.dot, { backgroundColor: t.accent }]} />
            <View style={styles.rowBody}>
              <Text style={[styles.rowLabel, { color: theme.ink }]}>{t.label}</Text>
              <Text style={[styles.rowNote, { color: theme.sub }]}>{t.note}</Text>
            </View>
            {active && <CheckIcon size={18} color={theme.ink} strokeWidth={1.7} />}
          </Pressable>
        );
      })}
    </ModalSheet>
  );
}

const styles = StyleSheet.create({
  heading: { marginBottom: 14, paddingHorizontal: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, borderWidth: 1, marginBottom: 8 },
  dot: { width: 14, height: 14, borderRadius: 7 },
  rowBody: { flex: 1 },
  rowLabel: { fontSize: 15, fontFamily: 'IBMPlexSansKR_500Medium' },
  rowNote: { fontSize: 12, marginTop: 3, fontFamily: 'IBMPlexSansKR_400Regular', lineHeight: 17 },
});
