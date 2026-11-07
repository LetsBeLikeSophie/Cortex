import React, { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Theme } from '../theme/themes';
import { PRIVACY_URL, TERMS_URL, strings } from '../i18n';
import { fetchPolicyNotice } from '../api/client';

import { BODY_KR } from '../theme/themes';
const S = strings({
  ko: { text: '약관·방침이 곧 바뀌어요', terms: '약관', privacy: '방침', close: '공지 닫기' },
  en: { text: 'Terms and privacy are changing soon', terms: 'Terms', privacy: 'Privacy', close: 'Close notice' },
  ja: { text: '規約・ポリシーがまもなく変わります', terms: '規約', privacy: 'ポリシー', close: 'お知らせを閉じる' },
  'zh-Hans': { text: '条款与隐私政策即将变更', terms: '条款', privacy: '隐私', close: '关闭通知' },
  'zh-Hant': { text: '條款與隱私權政策即將變更', terms: '條款', privacy: '隱私', close: '關閉通知' },
});

// The in-app notice the terms and the privacy policy promise for their
// changes (at least 7 days before they take effect). The server says which
// notice is current (GET /notice), so a new revision needs no app build.
// Shown until dismissed or until the change takes effect.
const KEY = 'cortex.notice.dismissed';

export function PolicyNotice({ theme }: { theme: Theme }) {
  const [notice, setNotice] = useState<{ id: string; until: string } | null>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchPolicyNotice()
      .then(async ({ notice: n }) => {
        if (!n || Date.now() > Date.parse(n.until)) return;
        const dismissed = await AsyncStorage.getItem(KEY).catch(() => null);
        if (cancelled || dismissed === n.id) return;
        setNotice(n);
        setShow(true);
      })
      // An older server without /notice, or offline: no notice this time.
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!show) return null;
  const dismiss = () => {
    setShow(false);
    if (notice) AsyncStorage.setItem(KEY, notice.id).catch(() => {});
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
  text: { fontSize: 13, fontFamily: BODY_KR },
  link: { textDecorationLine: 'underline' },
});
