import React, { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Theme } from '../theme/themes';
import { PRIVACY_URL, TERMS_URL, strings } from '../i18n';

const S = strings({
  ko: { text: '10월 말 약관·방침이 바뀌어요', terms: '약관', privacy: '방침', close: '공지 닫기' },
  en: { text: 'Terms and privacy change end of Oct', terms: 'Terms', privacy: 'Privacy', close: 'Close notice' },
  ja: { text: '10月末に規約・ポリシーが変わります', terms: '規約', privacy: 'ポリシー', close: 'お知らせを閉じる' },
  'zh-Hans': { text: '10月底条款与隐私政策变更', terms: '条款', privacy: '隐私', close: '关闭通知' },
  'zh-Hant': { text: '10月底條款與隱私權政策變更', terms: '條款', privacy: '隱私', close: '關閉通知' },
});

// The in-app notice the terms and the privacy policy promise for their
// changes (at least 7 days before they take effect): privacy Oct 30,
// terms Oct 31. One notice at a time: shown until
// dismissed or until the change takes effect (after that it's just the policy).
const NOTICE = {
  id: 'terms-privacy-2026-10-31',
  until: Date.parse('2026-10-31T00:00:00+09:00'),
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
      <Text style={[styles.text, styles.textWrap, { color: theme.ink }]} numberOfLines={2}>
        {S.text}{' '}
        <Text style={styles.link} onPress={() => Linking.openURL(TERMS_URL).catch(() => {})}>{S.terms}</Text>
        {' · '}
        <Text style={styles.link} onPress={() => Linking.openURL(PRIVACY_URL).catch(() => {})}>{S.privacy}</Text>
      </Text>
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
