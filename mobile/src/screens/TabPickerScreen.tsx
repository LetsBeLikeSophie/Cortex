import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useTheme } from '../theme/ThemeContext';
import { ALL_CATEGORIES, CategoryTab, loadHomeTabs, saveHomeTabs } from '../data/tabs';
import { CheckIcon } from '../components/Icons';
import type { RootStackParamList } from '../navigation/types';

// Same bottom-sheet shape as ThemePickerScreen, but multi-select: each row
// toggles independently instead of picking one and closing, since the home
// tab strip can show any combination of the fixed categories.
export default function TabPickerScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const card = theme.list === 'card';
  const [selected, setSelected] = useState<CategoryTab[]>([]);

  useEffect(() => {
    loadHomeTabs().then(setSelected);
  }, []);

  const toggle = (cat: CategoryTab) => {
    const next = selected.includes(cat) ? selected.filter((c) => c !== cat) : [...selected, cat];
    setSelected(next);
    saveHomeTabs(next);
  };

  return (
    <View style={StyleSheet.absoluteFill}>
      <Pressable style={StyleSheet.absoluteFill} onPress={() => navigation.goBack()}>
        <BlurView
          intensity={18}
          tint={theme.dark ? 'dark' : 'light'}
          style={[StyleSheet.absoluteFill, { backgroundColor: theme.dark ? 'rgba(4,5,7,0.5)' : 'rgba(20,20,15,0.28)' }]}
        />
      </Pressable>

      <View
        style={[
          styles.sheet,
          {
            backgroundColor: theme.bg,
            borderTopLeftRadius: card ? 30 : 26,
            borderTopRightRadius: card ? 30 : 26,
            paddingBottom: 24 + insets.bottom,
          },
        ]}
      >
        <View style={[styles.grabber, { backgroundColor: theme.line }]} />
        <Text style={[styles.heading, { color: theme.ink, fontFamily: theme.headFamily, fontWeight: theme.headWeight }]}>
          홈 화면 탭
        </Text>
        <Text style={[styles.sub, { color: theme.sub }]}>보여줄 카테고리를 골라주세요. 모두 탭은 항상 남아있어요.</Text>

        {ALL_CATEGORIES.map((cat) => {
          const active = selected.includes(cat);
          return (
            <Pressable
              key={cat}
              onPress={() => toggle(cat)}
              style={[styles.row, { borderColor: active ? theme.ink : theme.line, backgroundColor: active ? theme.soft : 'transparent' }]}
            >
              <Text style={[styles.rowLabel, { color: theme.ink }]}>{cat}</Text>
              {active && <CheckIcon size={18} color={theme.ink} strokeWidth={1.7} />}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingTop: 20 },
  grabber: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 18 },
  heading: { fontSize: 20, marginBottom: 6, paddingHorizontal: 4 },
  sub: { fontSize: 13, marginBottom: 16, paddingHorizontal: 4, fontFamily: 'IBMPlexSansKR_400Regular', lineHeight: 19 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 8,
  },
  rowLabel: { fontSize: 15, fontFamily: 'IBMPlexSansKR_500Medium' },
});
