import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { File } from 'expo-file-system';
import { Asset } from 'expo-media-library';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useTheme } from '../theme/ThemeContext';
import { MONO, emToTracking } from '../theme/themes';
import { copyFor } from '../data/content';
import { saveTextItem, saveLinkItem, saveScreenshotItem, ApiItem, ItemSource } from '../api/client';
import { sourceLabel } from '../api/format';
import { CheckIcon } from '../components/Icons';
import { TagChip } from '../components/Chips';
import { Heading } from '../components/Typography';
import { ModalSheet } from '../components/ModalSheet';
import { GhostButton, SolidButton } from '../components/Buttons';
import { useRecentScreenshots } from '../hooks/useRecentScreenshots';
import type { RootStackParamList } from '../navigation/types';

// Android's OS share sheet lands here now (expo-share-intent, see
// HomeScreen's handler) with sharedText/sharedUrl/sharedImageUri route
// params -- pre-filling below instead of requiring anyone to paste
// anything. Typing/pasting/picking manually still works the same way for
// everything else (and for iOS, which has no share extension yet).
type Status = 'input' | 'saving' | 'done' | 'error';

// No reliable way to know which app a share came from (Android's generic
// ACTION_SEND doesn't carry the sender's identity), but a link's own domain
// is a good enough guess to avoid dumping every URL into 'other'.
function guessSourceFromUrl(url: string): ItemSource {
  let host = '';
  try {
    host = new URL(url).hostname;
  } catch {
    return 'other';
  }
  if (host.includes('instagram.com')) return 'instagram';
  if (host.includes('youtube.com') || host.includes('youtu.be')) return 'youtube';
  return 'safari';
}

export default function SaveSheetScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'SaveSheet'>>();
  const card = theme.list === 'card';
  const tech = theme.copy === 'tech';
  const txt = copyFor(theme.copy);

  const [text, setText] = useState(route.params?.sharedText ?? '');
  const [linkUrl, setLinkUrl] = useState(route.params?.sharedUrl ?? null);
  const [image, setImage] = useState<{ base64: string; previewUri: string } | null>(null);
  const [status, setStatus] = useState<Status>('input');
  const [saved, setSaved] = useState<ApiItem | null>(null);
  const [error, setError] = useState('');

  // Only set when the image came from the "최근 스크린샷" quick-pick row below
  // (not the library/camera pickers) -- that's the one case where there's a
  // real device-photo-library asset behind it left to offer deleting once
  // the save succeeds.
  const [pickedScreenshotId, setPickedScreenshotId] = useState<string | null>(null);
  const [deleteOriginalState, setDeleteOriginalState] = useState<'idle' | 'deleting' | 'done' | 'error'>('idle');
  const recentScreenshots = useRecentScreenshots();

  // The share sheet only ever hands us a content:// / file:// URI for an
  // image, never the bytes directly -- read it into base64 once, here,
  // same shape pickFromLibrary/takePhoto already produce.
  useEffect(() => {
    const uri = route.params?.sharedImageUri;
    if (!uri) return;
    let cancelled = false;
    new File(uri)
      .base64()
      .then((base64) => {
        if (!cancelled) setImage({ base64, previewUri: uri });
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setStatus('error');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [route.params?.sharedImageUri]);

  const scrollRef = useRef<ScrollView>(null);

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
    setLinkUrl(null);
    setPickedScreenshotId(null);
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
    setLinkUrl(null);
    setPickedScreenshotId(null);
    setStatus('input');
    setImage({ base64: asset.base64, previewUri: asset.uri });
  };

  // The "최근 스크린샷" quick-pick row -- one tap instead of leaving the sheet
  // for the OS library picker. Keeps the asset id around so a successful
  // save can offer deleting the original (see the "done" branch below).
  const pickScreenshot = async (screenshot: { id: string; uri: string }) => {
    try {
      const base64 = await new File(screenshot.uri).base64();
      setText('');
      setLinkUrl(null);
      setPickedScreenshotId(screenshot.id);
      setStatus('input');
      setImage({ base64, previewUri: screenshot.uri });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  };

  const deleteOriginalScreenshot = async () => {
    if (!pickedScreenshotId) return;
    setDeleteOriginalState('deleting');
    try {
      await new Asset(pickedScreenshotId).delete();
      setDeleteOriginalState('done');
    } catch (err) {
      setDeleteOriginalState('error');
    }
  };

  const submit = () => {
    if (!image && !linkUrl && !text.trim()) return;
    setStatus('saving');
    setError('');
    const request = image
      ? saveScreenshotItem('other', image.base64)
      : linkUrl
        ? saveLinkItem(guessSourceFromUrl(linkUrl), linkUrl)
        : saveTextItem('memo', text.trim());
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
    <ModalSheet theme={theme} onClose={close} paddingBottom={32} maxHeightRatio={0.86}>
        {status === 'input' || status === 'saving' || status === 'error' ? (
          <>
          {/* This sheet is a native-stack "transparentModal", rendered on
              Android inside a BottomSheetDialog (a separate Dialog window)
              that does NOT get the Activity's windowSoftInputMode=
              "adjustResize" -- the OS never resizes around the keyboard
              here on either platform, so this has to do the work itself. */}
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flexShrink}>
          <ScrollView ref={scrollRef} style={styles.flexShrink} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Heading theme={theme} offset={2}>
              무엇을 저장할까요?
            </Heading>
            <Text style={[styles.savedSub, { color: theme.sub }]}>
              다른 앱에서 공유하거나, 텍스트를 붙여넣거나 사진을 골라서 저장해요.
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
            ) : linkUrl ? (
              <View style={[styles.linkPreview, { borderColor: theme.line, backgroundColor: card ? theme.surface : 'transparent' }]}>
                <Text style={{ color: theme.accent, fontFamily: 'IBMPlexSansKR_500Medium', fontSize: 14 }} numberOfLines={2}>
                  {linkUrl}
                </Text>
                <Pressable onPress={() => setLinkUrl(null)} disabled={status === 'saving'}>
                  <Text style={{ color: theme.sub, fontFamily: 'IBMPlexSansKR_400Regular', fontSize: 13, marginTop: 10 }}>
                    지우고 직접 입력
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
                  onFocus={() => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50)}
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

                {recentScreenshots.length > 0 && (
                  <View style={styles.screenshotSection}>
                    <Text style={[styles.screenshotLabel, { color: theme.sub }]}>최근 스크린샷</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.screenshotRow}>
                      {recentScreenshots.map((shot) => (
                        <Pressable key={shot.id} onPress={() => pickScreenshot(shot)} disabled={status === 'saving'}>
                          <Image source={{ uri: shot.uri }} style={[styles.screenshotThumb, { borderColor: theme.line }]} />
                        </Pressable>
                      ))}
                    </ScrollView>
                  </View>
                )}
              </>
            )}

            {status === 'error' && (
              <Text style={{ color: theme.accent, marginTop: 10, fontFamily: 'IBMPlexSansKR_400Regular' }}>
                저장 실패: {error}
              </Text>
            )}
          </ScrollView>
          </KeyboardAvoidingView>

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
                  <Heading theme={theme} offset={2} style={{ marginTop: 8 }}>
                    {txt.savedTitle}
                  </Heading>
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

              {pickedScreenshotId && (
                <View style={styles.deleteOriginalRow}>
                  {deleteOriginalState === 'done' ? (
                    <Text style={[styles.deleteOriginalText, { color: theme.sub }]}>원본 스크린샷을 삭제했어요.</Text>
                  ) : deleteOriginalState === 'deleting' ? (
                    <ActivityIndicator color={theme.sub} size="small" />
                  ) : (
                    <Pressable onPress={deleteOriginalScreenshot}>
                      <Text style={[styles.deleteOriginalText, styles.deleteOriginalLink, { color: theme.accent }]}>
                        {deleteOriginalState === 'error' ? '삭제 실패, 다시 시도' : '원본 스크린샷 삭제할까요?'}
                      </Text>
                    </Pressable>
                  )}
                </View>
              )}

              <View style={styles.buttonRow}>
                <SolidButton label="확인" theme={theme} onPress={close} />
              </View>
            </>
          )
        )}
    </ModalSheet>
  );
}

const styles = StyleSheet.create({
  flexShrink: { flexShrink: 1 },
  photoButtonRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  photoButton: { flex: 1, borderWidth: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  imagePreviewWrap: { marginTop: 18, alignItems: 'center' },
  imagePreview: { width: '100%', aspectRatio: 1, borderRadius: 14, borderWidth: 1 },
  linkPreview: { marginTop: 18, borderWidth: 1, borderRadius: 14, padding: 16 },
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
  screenshotSection: { marginTop: 18 },
  screenshotLabel: { fontSize: 12.5, marginBottom: 8, fontFamily: 'IBMPlexSansKR_400Regular' },
  screenshotRow: { flexDirection: 'row', gap: 8 },
  screenshotThumb: { width: 64, height: 64, borderRadius: 10, borderWidth: 1 },
  deleteOriginalRow: { marginTop: 14, alignItems: 'center' },
  deleteOriginalText: { fontSize: 12.5, fontFamily: 'IBMPlexSansKR_400Regular' },
  deleteOriginalLink: { textDecorationLine: 'underline' },
});
