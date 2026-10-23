import React, { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Theme } from '../theme/themes';
import { PRIVACY_URL, strings } from '../i18n';

const S = strings({
  ko: { text: '개인정보처리방침이 10월 30일부터 바뀌어요', view: '보기', close: '공지 닫기' },
  en: { text: 'Our privacy policy changes on Oct 30', view: 'View', close: 'Close notice' },
  ja: { text: 'プライバシーポリシーが10月30日から変わります', view: '見る', close: 'お知らせを閉じる' },
  'zh-Hans': { text: '隐私政策将于10月30日起变更', view: '查看', close: '关闭通知' },
  'zh-Hant': { text: '隱私權政策將於10月30日起變更', view: '查看', close: '關閉通知' },
});

// The in-app notice the privacy policy promises for its changes (at least
// 7 days before they take effect). One notice at a time: shown until
// dismissed or until two weeks after it takes effect.
const NOTICE = {
  id: 'privacy-2026-10-30',
  text: S.text,
  url: PRIVACY_URL,
  until: Date.parse('2026-11-13T00:00:00+09:00'),
};
const KEY = 'cortex.notice.dismissed';

export function PolicyNotice({ theme }: { theme: Theme }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (Date.now() > NOTICE.until) return;
    AsyncStorage.getItem(KEY)
      .then((v) => setShow(v !== NOTICE.id))
      .catch(() => setShow(true));
  }, []);

  if (!show) return null;
  const dismiss = () => {
    setShow(false);
    AsyncStorage.setItem(KEY, NOTICE.id).catch(() => {});
  };
  return (
    <View style={styles.row}>
      <Pressable onPress={() => Linking.openURL(NOTICE.url).catch(() => {})} hitSlop={6} style={styles.textWrap}>
        <Text style={[styles.text, { color: theme.ink }]} numberOfLines={1}>
          {NOTICE.text} <Text style={styles.link}>{S.view}</Text>
        </Text>
      </Pressable>
      <Pressable onPress={dismiss} hitSlop={10} accessibilityLabel={S.close}>
        <Text style={[styles.text, { color: theme.sub }]}>×</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  textWrap: { flex: 1 },
  text: { fontSize: 13, fontFamily: 'IBMPlexSansKR_400Regular' },
  link: { textDecorationLine: 'underline' },
});
