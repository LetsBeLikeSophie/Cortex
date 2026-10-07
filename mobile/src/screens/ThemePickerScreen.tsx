import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useTheme } from '../theme/ThemeContext';
import { LAYOUT_ORDER, LAYOUTS, LayoutKey, PALETTE_ORDER, PALETTES, PaletteKey } from '../theme/themes';
import { CheckIcon, LayoutIcon } from '../components/Icons';
import { ModalSheet } from '../components/ModalSheet';
import { Heading } from '../components/Typography';
import type { RootStackParamList } from '../navigation/types';

// Picks layout (card shape) and color (palette) independently. Layout is a
// row of icon "radio buttons" -- each icon draws the one visual trait that
// tells that layout apart from the rest (see LayoutIcon), so recognizing
// an option doesn't depend on reading its name. A text list read fine on
// its own but was more to read than five short icons need; a wireframe
// preview tile per option read as too busy once there were several to
// compare at once. Color stays the swatch row it already was.
export default function ThemePickerScreen() {
  const { theme, layoutKey, setLayoutKey, paletteKey, setPaletteKey } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const activePalette = PALETTES[paletteKey];
  const activeLayout = LAYOUTS[layoutKey];

  return (
    <ModalSheet
      theme={theme}
      onClose={() => navigation.goBack()}
      bordered={false}
      paddingBottom={24}
      paddingHorizontal={20}
      grabberMarginBottom={18}
      maxHeightRatio={0.7}
    >
      <Heading theme={theme} size={20} style={styles.heading}>
        테마
      </Heading>

      <ScrollView showsVerticalScrollIndicator={false} style={styles.flexShrink}>
        <Text style={[styles.sectionLabel, { color: theme.sub }]}>레이아웃</Text>
        <View style={styles.layoutRow}>
          {LAYOUT_ORDER.map((key: LayoutKey) => {
            const active = key === layoutKey;
            return (
              <Pressable
                key={key}
                onPress={() => setLayoutKey(key)}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                accessibilityLabel={LAYOUTS[key].label}
                style={styles.layoutOpt}
                hitSlop={4}
              >
                <View
                  style={[
                    styles.layoutIcon,
                    {
                      borderColor: active ? theme.ink : theme.line,
                      backgroundColor: active ? theme.soft : theme.surface,
                    },
                  ]}
                >
                  <LayoutIcon layoutKey={key} size={20} color={theme.ink} accent={theme.accent} surface={theme.surface} />
                </View>
                <View
                  style={[
                    styles.layoutRadio,
                    {
                      borderColor: active ? theme.accent : theme.line,
                      backgroundColor: active ? theme.accent : 'transparent',
                    },
                  ]}
                />
              </Pressable>
            );
          })}
        </View>
        <Text style={[styles.layoutCaption, { color: theme.sub }]}>{activeLayout.label}</Text>

        <Text style={[styles.sectionLabel, styles.colorSectionLabel, { color: theme.sub }]}>색</Text>
        <View style={styles.swatchRow}>
          {PALETTE_ORDER.map((key: PaletteKey) => {
            const p = PALETTES[key];
            const active = key === paletteKey;
            return (
              <Pressable key={key} onPress={() => setPaletteKey(key)} style={styles.swatchWrap} hitSlop={4}>
                <View
                  style={[
                    styles.swatch,
                    { backgroundColor: p.accent, borderColor: active ? theme.ink : 'transparent' },
                  ]}
                >
                  {active && <CheckIcon size={14} color="#fff" strokeWidth={2.4} />}
                </View>
              </Pressable>
            );
          })}
        </View>
        <Text style={[styles.swatchCaption, { color: theme.sub }]}>
          {activePalette.label} · {activePalette.note}
        </Text>
      </ScrollView>
    </ModalSheet>
  );
}

const styles = StyleSheet.create({
  flexShrink: { flexShrink: 1 },
  heading: { marginBottom: 14, paddingHorizontal: 4 },
  sectionLabel: { fontSize: 12, fontFamily: 'IBMPlexSansKR_500Medium', marginBottom: 10, paddingHorizontal: 4 },
  colorSectionLabel: { marginTop: 22 },
  layoutRow: { flexDirection: 'row', gap: 12, paddingHorizontal: 2 },
  layoutOpt: { alignItems: 'center', gap: 7 },
  layoutIcon: {
    width: 40,
    height: 40,
    borderRadius: 11,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  layoutRadio: { width: 6, height: 6, borderRadius: 3, borderWidth: 1.3 },
  layoutCaption: { fontSize: 11.5, marginTop: 10, paddingHorizontal: 4, fontFamily: 'IBMPlexSansKR_400Regular' },
  swatchRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, paddingHorizontal: 2 },
  swatchWrap: { padding: 2 },
  swatch: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  swatchCaption: { fontSize: 12.5, marginTop: 12, paddingHorizontal: 4, fontFamily: 'IBMPlexSansKR_400Regular' },
});
