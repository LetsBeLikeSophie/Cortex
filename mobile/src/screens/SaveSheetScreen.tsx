import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Easing,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useTheme } from '../theme/ThemeContext';
import { MONO, emToTracking } from '../theme/themes';
import { copyFor } from '../data/content';
import { saveTextItem, saveScreenshotItem, ApiItem } from '../api/client';
import { sourceLabel } from '../api/format';
import { CheckIcon } from '../components/Icons';
import { TagChip } from '../components/Chips';
import { GhostButton, SolidButton } from '../components/Buttons';
import type { RootStackParamList } from '../navigation/types';

const SHEET_TRAVEL = Dimensions.get('window').height;

// There's no real OS share extension wired up yet (see mobile/AGENTS.md /
// the project handoff notes) -- until then this screen doubles as the
// "share" entry point itself: type/paste what you'd have shared, and it
// goes through the same POST /items -> Claude classification -> Supabase
// pipeline a real share hand-off would use.
type Status = 'input' | 'saving' | 'done' | 'error';

export default function SaveSheetScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const card = theme.list === 'card';
  const tech = theme.copy === 'tech';
  const txt = copyFor(theme.copy);

  const [text, setText] = useState('');
  const [image, setImage] = useState<{ base64: string; previewUri: string } | null>(null);
  const [status, setStatus] = useState<Status>('input');
  const [saved, setSaved] = useState<ApiItem | null>(null);
  const [error, setError] = useState('');

  // Shorter than it looks like it should be -- RN Web always falls back to
  // JS-driven Animated (no native driver there), so 220ms already reads
  // about as snappy as a native 360ms slide would.
  const translateY = useRef(new Animated.Value(SHEET_TRAVEL)).current;
  useEffect(() => {
    Animated.timing(translateY, {
      toValue: 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [translateY]);

  const close = () => navigation.goBack();

  // Picking a photo and typing a memo are mutually exclusive in this sheet
  // -- picking one clears the other rather than trying to send both.
  const pickFromLibrary = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError('사진 접근 권한이 필요해요');
      setStatus('error');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], base64: true, quality: 0.8 });
    const asset = result.canceled ? null : result.assets[0];
    if (!asset?.base64) return;
    setText('');
    setStatus('input');
    setImage({ base64: asset.base64, previewUri: asset.uri });
  };

  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      setError('카메라 권한이 필요해요');
      setStatus('error');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ base64: true, quality: 0.8 });
    const asset = result.canceled ? null : result.assets[0];
    if (!asset?.base64) return;
    setText('');
    setStatus('input');
    setImage({ base64: asset.base64, previewUri: asset.uri });
  };

  const submit = () => {
    if (!image && !text.trim()) return;
    setStatus('saving');
    setError('');
    const request = image ? saveScreenshotItem('other', image.base64) : saveTextItem('memo', text.trim());
    request
      .then((item) => {
        setSaved(item);
        setStatus('done');
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
        setStatus('error');
      });
  };

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
            shadowOpacity: theme.dark ? 0.45 : 0.14,
          },
        ]}
      >
        <View style={[styles.grabber, { backgroundColor: theme.sub }]} />

        {status === 'input' || status === 'saving' || status === 'error' ? (
          <>
            <Text
              style={{
                fontFamily: theme.headFamily,
                fontWeight: theme.headWeight,
                fontSize: theme.headSize - 2,
                lineHeight: (theme.headSize - 2) * 1.15,
                letterSpacing: emToTracking(-0.02, theme.headSize - 2),
                color: theme.ink,
              }}
            >
              무엇을 저장할까요?
            </Text>
            <Text style={[styles.savedSub, { color: theme.sub }]}>
              공유 시트에서 넘어올 텍스트를 아직은 여기에 붙여넣어 테스트해요.
            </Text>

            {image ? (
              <View style={styles.imagePreviewWrap}>
                <Image source={{ uri: image.previewUri }} style={[styles.imagePreview, { borderColor: theme.line }]} />
                <Pressable onPress={() => setImage(null)} disabled={status === 'saving'}>
                  <Text style={{ color: theme.accent, fontFamily: 'IBMPlexSansKR_500Medium', fontSize: 13.5, marginTop: 10 }}>
                    사진 지우고 다시 선택
                  </Text>
                </Pressable>
              </View>
            ) : (
              <>
                <TextInput
                  value={text}
                  onChangeText={setText}
                  multiline
                  editable={status !== 'saving'}
                  placeholder="예: 성수동에 새로 생긴 크로플 맛집 완전 대박이래"
                  placeholderTextColor={theme.sub}
                  style={[
                    styles.input,
                    {
                      color: theme.ink,
                      borderColor: theme.line,
                      backgroundColor: card ? theme.surface : 'transparent',
                      fontFamily: 'IBMPlexSansKR_400Regular',
                      outlineWidth: 0,
                    },
                  ]}
                />

                <View style={styles.photoButtonRow}>
                  <Pressable
                    onPress={pickFromLibrary}
                    disabled={status === 'saving'}
                    style={[styles.photoButton, { borderColor: theme.line }]}
                  >
                    <Text style={{ color: theme.ink, fontFamily: 'IBMPlexSansKR_400Regular', fontSize: 13.5 }}>
                      앨범에서 선택
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={takePhoto}
                    disabled={status === 'saving'}
                    style={[styles.photoButton, { borderColor: theme.line }]}
                  >
                    <Text style={{ color: theme.ink, fontFamily: 'IBMPlexSansKR_400Regular', fontSize: 13.5 }}>
                      카메라로 촬영
                    </Text>
                  </Pressable>
                </View>
              </>
            )}

            {status === 'error' && (
              <Text style={{ color: theme.accent, marginTop: 10, fontFamily: 'IBMPlexSansKR_400Regular' }}>
                저장 실패: {error}
              </Text>
            )}

            <View style={styles.buttonRow}>
              <GhostButton label="취소" theme={theme} onPress={close} />
              {status === 'saving' ? (
                <View style={[styles.savingButton, { borderColor: theme.line }]}>
                  <ActivityIndicator color={theme.accent} />
                </View>
              ) : (
                <SolidButton label="저장하기" theme={theme} onPress={submit} />
              )}
            </View>
          </>
        ) : (
          saved && (
            <>
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
                    {sourceLabel(saved.source, true)}
                  </Text>
                  <Text style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: emToTracking(0.12, 10.5), color: theme.sub }}>
                    {saved.category}
                  </Text>
                </View>
                <Text style={[styles.title, { color: theme.ink }]}>{saved.title ?? saved.raw_text}</Text>
                {saved.snippet && <Text style={[styles.snippet, { color: theme.sub }]}>{saved.snippet}</Text>}
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
                {saved.tags.map((tag) => (
                  <TagChip key={tag} label={tag} theme={theme} />
                ))}
              </View>

              <View style={styles.buttonRow}>
                <SolidButton label="확인" theme={theme} onPress={close} />
              </View>
            </>
          )
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 24,
    paddingTop: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowRadius: 24,
    elevation: 16,
  },
  grabber: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 24 },
  photoButtonRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  photoButton: { flex: 1, borderWidth: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  imagePreviewWrap: { marginTop: 18, alignItems: 'center' },
  imagePreview: { width: '100%', aspectRatio: 1, borderRadius: 14, borderWidth: 1 },
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
  input: {
    marginTop: 18,
    minHeight: 90,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    fontSize: 15,
    textAlignVertical: 'top',
  },
  savingButton: { flex: 1, borderRadius: 999, borderWidth: 1, paddingVertical: 14, alignItems: 'center' },
});
