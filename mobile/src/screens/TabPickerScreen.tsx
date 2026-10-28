import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useTheme } from '../theme/ThemeContext';
import { TagTab, loadHomeTabs, saveHomeTabs } from '../data/tabs';
import { fetchTags } from '../api/client';
import { CheckIcon, SearchIcon } from '../components/Icons';
import { ModalSheet } from '../components/ModalSheet';
import { fieldStyle } from '../components/Fields';
import { strings } from '../i18n';

const S = strings({
  ko: {
    title: '홈 화면 탭',
    sub: '홈에 보여줄 태그를 골라요',
    cleanup: '✦ 태그 정리하기',
    search: '태그 검색',
    noTags: '아직 저장된 태그가 없어요.',
    noMatch: '일치하는 태그가 없어요.',
  },
  en: {
    title: 'Home tabs',
    sub: 'Pick tags to show on Home',
    cleanup: '✦ Tidy up tags',
    search: 'Search tags',
    noTags: 'No tags yet.',
    noMatch: 'No matching tags.',
  },
  ja: {
    title: 'ホームのタブ',
    sub: 'ホームに出すタグを選びます',
    cleanup: '✦ タグを整理',
    search: 'タグを検索',
    noTags: 'まだタグがありません。',
    noMatch: '一致するタグがありません。',
  },
  'zh-Hans': {
    title: '首页标签页',
    sub: '选择要在首页显示的标签',
    cleanup: '✦ 整理标签',
    search: '搜索标签',
    noTags: '还没有标签。',
    noMatch: '没有匹配的标签。',
  },
  'zh-Hant': {
    title: '首頁分頁',
    sub: '選擇要在首頁顯示的標籤',
    cleanup: '✦ 整理標籤',
    search: '搜尋標籤',
    noTags: '還沒有標籤。',
    noMatch: '沒有符合的標籤。',
  },
});
import { Heading } from '../components/Typography';
import type { RootStackParamList } from '../navigation/types';

import { BODY_KR, BODY_KR_MEDIUM } from '../theme/themes';
// Same bottom-sheet shape as ThemePickerScreen, but multi-select: each row
// toggles independently instead of picking one and closing, since the home
// tab strip can pin any combination of tags. The list is every tag that
// actually appears on a saved item (fetched from the backend), filtered by
// what's typed -- there's no fixed list to browse since tags are freeform.
export default function TabPickerScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [selected, setSelected] = useState<TagTab[]>([]);
  const [allTags, setAllTags] = useState<TagTab[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  // Height of the title + description above the search box: the part that
  // may ride off the top of the screen when the keyboard pushes the sheet up.
  const [headerHeight, setHeaderHeight] = useState(0);

  // Read again whenever this sheet is back on top -- 태그 정리하기 opens over
  // it and renames tags and tabs; a stale list here would save the old tab
  // set back on the next toggle (an empty tab for a merged-away tag).
  useFocusEffect(
    useCallback(() => {
      loadHomeTabs().then(setSelected);
      fetchTags()
        .then((res) => setAllTags(res.tags))
        .catch(() => setAllTags([]))
        .finally(() => setLoading(false));
    }, [])
  );

  const toggle = (tag: TagTab) => {
    const next = selected.includes(tag) ? selected.filter((t) => t !== tag) : [...selected, tag];
    setSelected(next);
    saveHomeTabs(next);
  };

  // A home tab whose tag no longer has any saved item (all of them in the
  // trash, say) still has to be listed, or it could never be switched off.
  const listed = [...selected.filter((t) => !allTags.includes(t)), ...allTags];
  const visible = listed.filter((tag) => tag.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <ModalSheet
      theme={theme}
      onClose={() => navigation.goBack()}
      bordered={false}
      paddingBottom={24}
      paddingHorizontal={20}
      grabberMarginBottom={18}
      maxHeightRatio={0.8}
      liftForKeyboard
      keyboardOverflow={headerHeight}
    >
      <View style={styles.flexShrink}>
        <View onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}>
          <Heading theme={theme} size={20} style={styles.heading}>
            {S.title}
          </Heading>
          <Text style={[styles.sub, { color: theme.sub }]}>{S.sub}</Text>
          {listed.length > 1 && (
            <Pressable onPress={() => navigation.navigate('TagCleanup')} hitSlop={6} style={styles.cleanup}>
              <Text style={[styles.cleanupText, { color: theme.accent }]}>{S.cleanup}</Text>
            </Pressable>
          )}
        </View>

        <View style={[styles.searchBox, fieldStyle(theme)]}>
          <SearchIcon color={theme.sub} size={15} strokeWidth={1.4} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={S.search}
            placeholderTextColor={theme.sub}
            style={{ flex: 1, color: theme.ink, fontFamily: BODY_KR, fontSize: 14.5, padding: 0, outlineWidth: 0 }}
          />
        </View>

        {/* Fixed height regardless of result count -- typing a query that
            narrows the match list used to shrink this box (and the sheet
            around it) down to fit, which read as the whole window jumping
            around while typing. Fewer matches now just leaves blank space
            below instead of resizing anything. */}
        <View style={styles.resultsBox}>
          {loading ? (
            <ActivityIndicator color={theme.accent} style={{ marginTop: 24 }} />
          ) : listed.length === 0 ? (
            <Text style={[styles.emptyText, { color: theme.sub }]}>{S.noTags}</Text>
          ) : visible.length === 0 ? (
            <Text style={[styles.emptyText, { color: theme.sub }]}>{S.noMatch}</Text>
          ) : (
            <ScrollView style={styles.list} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
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
    </ModalSheet>
  );
}

const styles = StyleSheet.create({
  cleanup: { alignSelf: 'flex-start', marginTop: 10, paddingVertical: 4 },
  cleanupText: { fontSize: 13, fontFamily: BODY_KR_MEDIUM },
  flexShrink: { flexShrink: 1 },
  heading: { marginBottom: 6, paddingHorizontal: 4 },
  sub: { fontSize: 13, marginBottom: 16, paddingHorizontal: 4, fontFamily: BODY_KR, lineHeight: 19 },
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
  emptyText: { fontSize: 13.5, textAlign: 'center', paddingVertical: 20, fontFamily: BODY_KR },
  // Fixed height so typing doesn't resize the sheet -- but allowed to
  // shrink when the keyboard leaves less room (ModalSheet liftForKeyboard).
  resultsBox: { height: Dimensions.get('window').height * 0.45, flexShrink: 1, minHeight: 120 },
  list: { flex: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 8,
  },
  rowLabel: { fontSize: 15, fontFamily: BODY_KR_MEDIUM },
});
