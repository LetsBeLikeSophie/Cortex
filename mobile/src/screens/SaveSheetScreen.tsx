import React, { useEffect, useRef } from 'react';
import { Animated, Dimensions, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useTheme } from '../theme/ThemeContext';
import { MONO, emToTracking } from '../theme/themes';
import { copyFor, DEFAULT_TOTAL_SAVED, SAVED_ITEM } from '../data/content';
import { CheckIcon } from '../components/Icons';
import { TagAddChip, TagChip } from '../components/Chips';
import { GhostButton, SolidButton } from '../components/Buttons';
import type { RootStackParamList } from '../navigation/types';

const SHEET_TRAVEL = Dimensions.get('window').height;

export default function SaveSheetScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const card = theme.list === 'card';
  const tech = theme.copy === 'tech';
  const txt = copyFor(theme.copy);
  const nextCardNo = DEFAULT_TOTAL_SAVED + 1;

  const translateY = useRef(new Animated.Value(SHEET_TRAVEL)).current;
  useEffect(() => {
    Animated.timing(translateY, {
      toValue: 0,
      duration: 360,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [translateY]);

  const close = () => navigation.goBack();

  return (
    <View style={StyleSheet.absoluteFill}>
      <Pressable style={StyleSheet.absoluteFill} onPress={close}>
        <BlurView
          intensity={18}
          tint={theme.dark ? 'dark' : 'light'}
          style={[StyleSheet.absoluteFill, { backgroundColor: theme.dark ? 'rgba(4,5,7,0.5)' : 'rgba(20,20,15,0.28)' }]}
        />
      </Pressable>

      <Animated.View
        style={[
          styles.sheet,
          {
            backgroundColor: theme.bg,
            borderTopWidth: theme.dark ? 1 : 0,
            borderColor: theme.line,
            borderTopLeftRadius: card ? 30 : 26,
            borderTopRightRadius: card ? 30 : 26,
            paddingBottom: 32 + insets.bottom,
            transform: [{ translateY }],
          },
        ]}
      >
        <View style={[styles.grabber, { backgroundColor: theme.line }]} />

        <View style={styles.savedHead}>
          <View
            style={[
              styles.savedMark,
              {
                width: card ? 54 : 40,
                height: card ? 54 : 40,
                backgroundColor: card ? theme.accent + '26' : 'transparent',
                borderWidth: card ? 0 : 1,
                borderColor: theme.accent,
              },
            ]}
          >
            <CheckIcon size={card ? 24 : 18} color={theme.accent} strokeWidth={1.7} />
          </View>
          <View style={styles.savedHeadBody}>
            <Text
              style={{
                fontFamily: tech ? MONO : 'IBMPlexSansKR_400Regular',
                fontSize: tech ? 10.5 : 12.5,
                letterSpacing: tech ? emToTracking(0.22, 10.5) : emToTracking(0.02, 12.5),
                color: theme.accent,
              }}
            >
              {txt.savedLabel}
            </Text>
            <Text
              style={{
                fontFamily: theme.headFamily,
                fontWeight: theme.headWeight,
                fontSize: theme.headSize - 2,
                lineHeight: (theme.headSize - 2) * 1.15,
                letterSpacing: emToTracking(-0.02, theme.headSize - 2),
                color: theme.ink,
                marginTop: 8,
              }}
            >
              {txt.savedTitle}
            </Text>
            <Text style={[styles.savedSub, { color: theme.sub }]}>단어 하나만 적으면 다시 꺼내 드려요.</Text>
          </View>
        </View>

        <View
          style={[
            styles.savedCard,
            card
              ? {
                  backgroundColor: theme.surface,
                  borderRadius: theme.cardRadius,
                  borderWidth: theme.surfaceEdge ? 1 : 0,
                  borderColor: theme.surfaceEdge ?? undefined,
                  padding: 16,
                  paddingHorizontal: 18,
                  ...(theme.dark ? null : styles.savedCardShadow),
                }
              : { paddingTop: 20, borderTopWidth: 1, borderColor: theme.line },
          ]}
        >
          <View style={styles.savedCardMeta}>
            <Text style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: emToTracking(0.12, 10.5), color: theme.sub }}>
              {SAVED_ITEM.source}
            </Text>
            <Text style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: emToTracking(0.12, 10.5), color: theme.sub }}>
              #{nextCardNo}
            </Text>
          </View>
          <Text style={[styles.title, { color: theme.ink }]}>{SAVED_ITEM.title}</Text>
          <Text style={[styles.snippet, { color: theme.sub }]}>
            {SAVED_ITEM.author} · 사진 {SAVED_ITEM.photos}장 함께 저장
          </Text>
        </View>

        <Text
          style={{
            fontFamily: tech ? MONO : 'IBMPlexSansKR_400Regular',
            fontSize: tech ? 10.5 : 13,
            letterSpacing: tech ? emToTracking(0.14, 10.5) : emToTracking(0.01, 13),
            color: theme.sub,
            marginTop: 22,
          }}
        >
          {txt.tagLabel}
        </Text>
        <View style={styles.tagRow}>
          {SAVED_ITEM.tags.map((tag) => (
            <TagChip key={tag} label={tag} theme={theme} />
          ))}
          <TagAddChip label="+ 추가" theme={theme} />
        </View>

        <View style={styles.buttonRow}>
          <GhostButton label="메모 추가" theme={theme} onPress={close} />
          <SolidButton label="확인" theme={theme} onPress={close} />
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 24, paddingTop: 20 },
  grabber: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 24 },
  savedHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  savedMark: { borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  savedHeadBody: { flex: 1 },
  savedSub: { fontSize: 13.5, marginTop: 7, lineHeight: 21.6, fontFamily: 'IBMPlexSansKR_400Regular' },
  savedCard: { marginTop: 22 },
  savedCardShadow: { shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 1 },
  savedCardMeta: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  title: { fontSize: 15.5, lineHeight: 22.5, fontFamily: 'IBMPlexSansKR_400Regular' },
  snippet: { fontSize: 13, marginTop: 7, lineHeight: 20.8, fontFamily: 'IBMPlexSansKR_400Regular' },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  buttonRow: { flexDirection: 'row', gap: 10, marginTop: 26 },
});
