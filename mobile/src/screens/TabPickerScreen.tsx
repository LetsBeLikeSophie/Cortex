import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Dimensions, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useTheme } from '../theme/ThemeContext';
import { TagTab, loadHomeTabs, saveHomeTabs } from '../data/tabs';
import { fetchTags } from '../api/client';
import { CheckIcon, SearchIcon } from '../components/Icons';
import type { RootStackParamList } from '../navigation/types';

// Same bottom-sheet shape as ThemePickerScreen, but multi-select: each row
// toggles independently instead of picking one and closing, since the home
// tab strip can pin any combination of tags. The list is every tag that
// actually appears on a saved item (fetched from the backend), filtered by
// what's typed -- there's no fixed list to browse since tags are freeform.
export default function TabPickerScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const card = theme.list === 'card';
  const [selected, setSelected] = useState<TagTab[]>([]);
  const [allTags, setAllTags] = useState<TagTab[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  useEffect(() => {
    loadHomeTabs().then(setSelected);
    fetchTags()
      .then((res) => setAllTags(res.tags))
      .catch(() => setAllTags([]))
      .finally(() => setLoading(false));
  }, []);

  const toggle = (tag: TagTab) => {
    const next = selected.includes(tag) ? selected.filter((t) => t !== tag) : [...selected, tag];
    setSelected(next);
    saveHomeTabs(next);
  };

  const visible = allTags.filter((tag) => tag.toLowerCase().includes(query.trim().toLowerCase()));

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
            shadowOpacity: theme.dark ? 0.45 : 0.14,
          },
        ]}
      >
        <View style={[styles.grabber, { backgroundColor: theme.sub }]} />
        <Text style={[styles.heading, { color: theme.ink, fontFamily: theme.headFamily, fontWeight: theme.headWeight }]}>
          홈 화면 탭
        </Text>
        <Text style={[styles.sub, { color: theme.sub }]}>보여줄 태그를 검색해서 골라주세요. 모두 탭은 항상 남아있어요.</Text>

        <View style={[styles.searchBox, { borderColor: theme.line, backgroundColor: card ? theme.surface : 'transparent' }]}>
          <SearchIcon color={theme.sub} size={15} strokeWidth={1.4} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="태그 검색"
            placeholderTextColor={theme.sub}
            style={{ flex: 1, color: theme.ink, fontFamily: 'IBMPlexSansKR_400Regular', fontSize: 14.5, padding: 0, outlineWidth: 0 }}
          />
        </View>

        {loading ? (
          <ActivityIndicator color={theme.accent} style={{ marginTop: 24 }} />
        ) : allTags.length === 0 ? (
          <Text style={[styles.emptyText, { color: theme.sub }]}>아직 저장된 태그가 없어요.</Text>
        ) : visible.length === 0 ? (
          <Text style={[styles.emptyText, { color: theme.sub }]}>일치하는 태그가 없어요.</Text>
        ) : (
          <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
            {visible.map((tag) => {
              const active = selected.includes(tag);
              return (
                <Pressable
                  key={tag}
                  onPress={() => toggle(tag)}
                  style={[styles.row, { borderColor: active ? theme.ink : theme.line, backgroundColor: active ? theme.soft : 'transparent' }]}
                >
                  <Text style={[styles.rowLabel, { color: theme.ink }]}>{tag}</Text>
                  {active && <CheckIcon size={18} color={theme.ink} strokeWidth={1.7} />}
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingTop: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowRadius: 24,
    elevation: 16,
  },
  grabber: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 18 },
  heading: { fontSize: 20, marginBottom: 6, paddingHorizontal: 4 },
  sub: { fontSize: 13, marginBottom: 16, paddingHorizontal: 4, fontFamily: 'IBMPlexSansKR_400Regular', lineHeight: 19 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    marginBottom: 14,
  },
  emptyText: { fontSize: 13.5, textAlign: 'center', paddingVertical: 20, fontFamily: 'IBMPlexSansKR_400Regular' },
  list: { maxHeight: Dimensions.get('window').height * 0.45 },
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
