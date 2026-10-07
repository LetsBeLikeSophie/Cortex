import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Linking,
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
import * as Clipboard from 'expo-clipboard';
import MediaLibrary from '../native/mediaLibrary';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useTheme } from '../theme/ThemeContext';
import { MONO, emToTracking } from '../theme/themes';
import { copyFor } from '../data/content';
import { saveTextItem, saveLinkItem, saveScreenshotItem, addTag, ApiItem, ItemSource } from '../api/client';
import { sourceLabel } from '../api/format';
import { CheckIcon } from '../components/Icons';
import { TagChip, TagAddChip } from '../components/Chips';
import { Heading } from '../components/Typography';
import { ModalSheet } from '../components/ModalSheet';
import { GhostButton, SolidButton } from '../components/Buttons';
import { VoiceInputButton } from '../components/VoiceInputButton';
import { useRecentScreenshots, RecentScreenshot } from '../hooks/useRecentScreenshots';
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
  // Optional "why I saved this" -- only shown for a photo/link save (a plain
  // text save already is a freeform note, so a second box next to it would
  // just be two text inputs saying the same kind of thing).
  const [note, setNote] = useState('');
  const [status, setStatus] = useState<Status>('input');
  const [saved, setSaved] = useState<ApiItem | null>(null);
  const [error, setError] = useState('');

  // Picking any screenshot from the "최근 스크린샷" row below switches this
  // sheet into a dedicated multi-select mode (mutually exclusive with the
  // text/link/single-image flow above it) -- tapping thumbnails toggles
  // them, and submit saves every selected one. One tile behaves the same as
  // many; there's no separate "just one" path to keep in sync.
  const [selectedScreenshots, setSelectedScreenshots] = useState<RecentScreenshot[]>([]);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);
  const [savedBulk, setSavedBulk] = useState<{ items: ApiItem[]; failed: number } | null>(null);
  // Optional, applied to every item in the batch after it saves -- collapsed
  // behind a chip by default so it costs nothing for the common "just dump
  // these in" case, same affordance language as ItemDetailScreen's "+ 태그".
  const [bulkTag, setBulkTag] = useState('');
  const [addingBulkTag, setAddingBulkTag] = useState(false);
  const [deleteOriginalState, setDeleteOriginalState] = useState<'idle' | 'deleting' | 'done'>('idle');
  const { screenshots: recentScreenshots, permissionDenied: screenshotsPermissionDenied } = useRecentScreenshots();

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
  // -- picking one clears the others rather than trying to send several.
  // allowsMultipleSelection lets the OS picker itself offer multi-select;
  // when more than one actually comes back, this routes into the same
  // bulk-save path "최근 스크린샷"'s multi-select already uses (submitBulk
  // only ever needs .uri per item, read fresh via File().base64() there,
  // so a picked asset's uri works exactly like a recent-screenshot's)
  // instead of only ever keeping assets[0] and silently dropping the rest.
  const pickFromLibrary = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError('사진 접근 권한이 필요해요');
      setStatus('error');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      base64: true,
      quality: 0.8,
      allowsMultipleSelection: true,
    });
    if (result.canceled || result.assets.length === 0) return;

    if (result.assets.length > 1) {
      setText('');
      setLinkUrl(null);
      setImage(null);
      setNote('');
      setBulkTag('');
      setAddingBulkTag(false);
      setStatus('input');
      setSelectedScreenshots(result.assets.map((a) => ({ id: a.assetId ?? a.uri, uri: a.uri })));
      return;
    }

    const asset = result.assets[0];
    if (!asset?.base64) return;
    setText('');
    setLinkUrl(null);
    setNote('');
    setSelectedScreenshots([]);
    setBulkTag('');
    setAddingBulkTag(false);
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
    setNote('');
    setSelectedScreenshots([]);
    setBulkTag('');
    setAddingBulkTag(false);
    setStatus('input');
    setImage({ base64: asset.base64, previewUri: asset.uri });
  };

  // Deliberately behind a tap, never read automatically on open -- iOS 16+
  // shows its own "Allow Paste" prompt the moment an app reads the
  // clipboard, and doing that without the user having just asked for it
  // reads as exactly the clipboard-sniffing behavior that prompt exists to
  // catch.
  const pasteFromClipboard = async () => {
    const value = await Clipboard.getStringAsync();
    if (!value.trim()) return;
    setSelectedScreenshots([]);
    setBulkTag('');
    setAddingBulkTag(false);
    setImage(null);
    setNote('');
    try {
      const url = new URL(value.trim());
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        setLinkUrl(value.trim());
        setText('');
        return;
      }
    } catch {
      // Not a URL -- fall through to plain text.
    }
    setText(value);
    setLinkUrl(null);
  };

  // Tapping a "최근 스크린샷" thumbnail toggles it in/out of the batch --
  // selecting the first one is what switches the sheet into bulk mode.
  const toggleScreenshot = (shot: RecentScreenshot) => {
    setText('');
    setLinkUrl(null);
    setImage(null);
    setNote('');
    setSelectedScreenshots((current) =>
      current.some((s) => s.id === shot.id) ? current.filter((s) => s.id !== shot.id) : [...current, shot]
    );
  };

  const deleteOriginalScreenshots = async () => {
    if (selectedScreenshots.length === 0 || !MediaLibrary) return;
    setDeleteOriginalState('deleting');
    try {
      await MediaLibrary.Asset.delete(selectedScreenshots.map((s) => new MediaLibrary!.Asset(s.id)));
      setDeleteOriginalState('done');
    } catch (err) {
      // Android's own delete-confirmation dialog rejects this promise when
      // the user taps Cancel -- that's not a failure worth a scary "failed,
      // retry" message, just back to the original ask so they can tap it
      // again whenever they actually want to.
      setDeleteOriginalState('idle');
    }
  };

  // A handful at a time, not all at once or strictly one-by-one -- mostly
  // throttles the upload+insert requests themselves now that classification
  // runs in the background rather than inside this call. The background
  // classification calls it kicks off server-side aren't throttled by this
  // at all though -- saving a big batch still fires that many Claude calls
  // in a short window, so a large-enough batch could still trip a rate
  // limit there (showing up as some items landing on classification_status
  // 'failed' rather than this request itself failing).
  const BULK_CONCURRENCY = 3;

  const submitBulk = async () => {
    setStatus('saving');
    setError('');
    const results: (ApiItem | null)[] = new Array(selectedScreenshots.length).fill(null);
    let completed = 0;
    setBulkProgress({ done: 0, total: selectedScreenshots.length });

    const sharedTag = bulkTag.trim();

    for (let start = 0; start < selectedScreenshots.length; start += BULK_CONCURRENCY) {
      const batch = selectedScreenshots.slice(start, start + BULK_CONCURRENCY);
      await Promise.all(
        batch.map(async (shot, offset) => {
          try {
            const base64 = await new File(shot.uri).base64();
            const item = await saveScreenshotItem('other', base64);
            results[start + offset] = item;
            // Best-effort -- a failed shared-tag add shouldn't undo an
            // otherwise-successful save.
            if (sharedTag) await addTag(item.id, sharedTag).catch(() => {});
          } catch {
            // left as null -- counted as a failure below
          } finally {
            completed += 1;
            setBulkProgress({ done: completed, total: selectedScreenshots.length });
          }
        })
      );
    }

    const items = results.filter((item): item is ApiItem => item !== null);
    const failed = results.length - items.length;
    if (items.length === 0) {
      setError('전부 저장하지 못했어요');
      setStatus('error');
      return;
    }
    setSavedBulk({ items, failed });
    setStatus('done');
  };

  const submit = () => {
    if (selectedScreenshots.length > 0) {
      submitBulk();
      return;
    }
    if (!image && !linkUrl && !text.trim()) return;
    setStatus('saving');
    setError('');
    const trimmedNote = note.trim() || undefined;
    const request = image
      ? saveScreenshotItem('other', image.base64, trimmedNote)
      : linkUrl
        ? saveLinkItem(guessSourceFromUrl(linkUrl), linkUrl, trimmedNote)
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

  const screenshotGrid = (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.screenshotRow}>
      {recentScreenshots.map((shot) => {
        const selected = selectedScreenshots.some((s) => s.id === shot.id);
        return (
          <Pressable key={shot.id} onPress={() => toggleScreenshot(shot)} disabled={status === 'saving'}>
            <Image
              source={{ uri: shot.uri }}
              style={[styles.screenshotThumb, { borderColor: selected ? theme.accent : theme.line, borderWidth: selected ? 2 : 1 }]}
            />
            {selected && (
              <View style={[styles.screenshotCheck, { backgroundColor: theme.accent }]}>
                <CheckIcon size={11} color="#fff" strokeWidth={2.2} />
              </View>
            )}
          </Pressable>
        );
      })}
    </ScrollView>
  );

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

                {/* Same pill shape + border convention as GhostButton (the
                    bottom 취소/저장 row) -- just not the component itself,
                    since GhostButton's full size/label scale was built for
                    two buttons in a row, not three this tight. */}
                <View style={styles.photoButtonRow}>
                  <Pressable
                    onPress={pasteFromClipboard}
                    disabled={status === 'saving'}
                    style={[styles.photoButton, { borderColor: card ? theme.line : theme.ink, backgroundColor: card ? theme.surface : 'transparent', borderRadius: theme.btnRadius }]}
                  >
                    <Text style={{ color: theme.ink, fontFamily: 'IBMPlexSansKR_400Regular', fontSize: 13.5 }}>
                      붙여넣기
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={pickFromLibrary}
                    disabled={status === 'saving'}
                    style={[styles.photoButton, { borderColor: card ? theme.line : theme.ink, backgroundColor: card ? theme.surface : 'transparent', borderRadius: theme.btnRadius }]}
                  >
                    <Text style={{ color: theme.ink, fontFamily: 'IBMPlexSansKR_400Regular', fontSize: 13.5 }}>
                      앨범에서 선택
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={takePhoto}
                    disabled={status === 'saving'}
                    style={[styles.photoButton, { borderColor: card ? theme.line : theme.ink, backgroundColor: card ? theme.surface : 'transparent', borderRadius: theme.btnRadius }]}
                  >
                    <Text style={{ color: theme.ink, fontFamily: 'IBMPlexSansKR_400Regular', fontSize: 13.5 }}>
                      카메라로 촬영
                    </Text>
                  </Pressable>
                </View>

                {recentScreenshots.length > 0 ? (
                  <View style={styles.screenshotSection}>
                    <View style={styles.bulkHeader}>
                      <Text style={[styles.screenshotLabel, { color: theme.sub, marginBottom: 0 }]}>
                        {selectedScreenshots.length > 0
                          ? `${selectedScreenshots.length}장 선택됨`
                          : '최근 스크린샷 · 여러 장 선택 가능'}
                      </Text>
                      {selectedScreenshots.length > 0 && (
                        <Pressable
                          onPress={() => {
                            setSelectedScreenshots([]);
                            setBulkTag('');
                            setAddingBulkTag(false);
                          }}
                          disabled={status === 'saving'}
                        >
                          <Text style={{ color: theme.accent, fontFamily: 'IBMPlexSansKR_500Medium', fontSize: 12.5 }}>
                            선택 취소
                          </Text>
                        </Pressable>
                      )}
                    </View>
                    {screenshotGrid}
                    {status === 'saving' && bulkProgress && (
                      <Text style={[styles.screenshotLabel, { color: theme.sub, marginTop: 10 }]}>
                        {bulkProgress.done}/{bulkProgress.total}장 저장 중...
                      </Text>
                    )}
                    {selectedScreenshots.length > 0 && status !== 'saving' && (
                      <View style={styles.bulkTagRow}>
                        {addingBulkTag ? (
                          <View style={[styles.newTagBox, { borderColor: theme.line }]}>
                            <TextInput
                              value={bulkTag}
                              onChangeText={setBulkTag}
                              autoFocus
                              placeholder="모두에게 추가할 태그"
                              placeholderTextColor={theme.sub}
                              onBlur={() => {
                                if (!bulkTag.trim()) setAddingBulkTag(false);
                              }}
                              style={{
                                color: theme.ink,
                                fontFamily: 'IBMPlexSansKR_400Regular',
                                fontSize: 13,
                                padding: 0,
                                minWidth: 100,
                                outlineWidth: 0,
                              }}
                            />
                          </View>
                        ) : (
                          <TagAddChip label="+ 모두에게 태그 추가" theme={theme} onPress={() => setAddingBulkTag(true)} />
                        )}
                      </View>
                    )}
                  </View>
                ) : (
                  screenshotsPermissionDenied && (
                    <View style={styles.screenshotSection}>
                      <Text style={[styles.screenshotLabel, { color: theme.sub }]}>최근 스크린샷</Text>
                      <Pressable onPress={() => Linking.openSettings()}>
                        <Text style={[styles.permissionHintText, { color: theme.accent }]}>
                          사진 접근 권한이 꺼져 있어서 최근 스크린샷을 불러올 수 없어요. 설정에서 허용해주세요.
                        </Text>
                      </Pressable>
                    </View>
                  )
                )}
              </>
            )}

            {(image || linkUrl) && selectedScreenshots.length === 0 && (
              <View style={styles.noteRow}>
                <TextInput
                  value={note}
                  onChangeText={setNote}
                  editable={status !== 'saving'}
                  maxLength={200}
                  placeholder="왜 저장했는지 한 줄 적어두면 나중에 찾기 쉬워요 (선택)"
                  placeholderTextColor={theme.sub}
                  style={[
                    styles.input,
                    styles.noteInput,
                    {
                      flex: 1,
                      color: theme.ink,
                      borderColor: theme.line,
                      backgroundColor: card ? theme.surface : 'transparent',
                      fontFamily: 'IBMPlexSansKR_400Regular',
                      outlineWidth: 0,
                    },
                  ]}
                />
                <VoiceInputButton theme={theme} onResult={(text) => setNote(text)} />
              </View>
            )}

            {status === 'error' && error.endsWith('권한이 필요해요') ? (
              <View style={{ marginTop: 10 }}>
                <Text style={{ color: theme.accent, fontFamily: 'IBMPlexSansKR_400Regular' }}>{error}</Text>
                <Pressable onPress={() => Linking.openSettings()}>
                  <Text style={[styles.permissionHintText, styles.permissionHintLink, { color: theme.accent }]}>
                    설정에서 권한 허용하기
                  </Text>
                </Pressable>
              </View>
            ) : (
              status === 'error' && (
                <Text style={{ color: theme.accent, marginTop: 10, fontFamily: 'IBMPlexSansKR_400Regular' }}>
                  저장 실패: {error}
                </Text>
              )
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
                <SolidButton
                  label={selectedScreenshots.length > 1 ? `${selectedScreenshots.length}장 저장하기` : '저장하기'}
                  theme={theme}
                  onPress={submit}
                />
              )}
            </View>
          </>
        ) : savedBulk ? (
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
                  {savedBulk.items.length}개 저장했어요
                </Heading>
                {savedBulk.failed > 0 && (
                  <Text style={[styles.savedSub, { color: theme.accent }]}>{savedBulk.failed}개는 저장하지 못했어요.</Text>
                )}
              </View>
            </View>

            <ScrollView style={styles.bulkResultList} showsVerticalScrollIndicator={false}>
              {savedBulk.items.map((item) => {
                const pending = item.classification_status === 'pending';
                return (
                  <View
                    key={item.id}
                    style={[
                      styles.bulkResultRow,
                      card
                        ? { backgroundColor: theme.surface, borderRadius: theme.cardRadius }
                        : { borderBottomWidth: 1, borderColor: theme.line },
                    ]}
                  >
                    <Text
                      style={[
                        styles.bulkResultTitle,
                        { color: pending ? theme.sub : theme.ink, fontStyle: pending ? 'italic' : 'normal' },
                      ]}
                      numberOfLines={1}
                    >
                      {item.title ?? item.raw_text ?? (pending ? '분석 중...' : '(제목 없음)')}
                    </Text>
                    {!pending && <Text style={{ fontFamily: MONO, fontSize: 10, color: theme.sub }}>{item.category}</Text>}
                  </View>
                );
              })}
            </ScrollView>

            {selectedScreenshots.length > 0 && (
              <View style={styles.deleteOriginalRow}>
                {deleteOriginalState === 'done' ? (
                  <Text style={[styles.deleteOriginalText, { color: theme.sub }]}>원본 스크린샷을 삭제했어요.</Text>
                ) : deleteOriginalState === 'deleting' ? (
                  <ActivityIndicator color={theme.sub} size="small" />
                ) : (
                  <Pressable onPress={deleteOriginalScreenshots}>
                    <Text style={[styles.deleteOriginalText, styles.deleteOriginalLink, { color: theme.accent }]}>
                      {`원본 스크린샷 ${selectedScreenshots.length}장 모두 삭제할까요?`}
                    </Text>
                  </Pressable>
                )}
              </View>
            )}

            <View style={styles.buttonRow}>
              <SolidButton label="확인" theme={theme} onPress={close} />
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
                      }
                    : { paddingTop: 20, borderTopWidth: 1, borderColor: theme.line },
                ]}
              >
                <View style={styles.savedCardMeta}>
                  <Text style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: emToTracking(0.12, 10.5), color: theme.sub }}>
                    {sourceLabel(saved.source, true)}
                  </Text>
                  {saved.classification_status !== 'pending' && (
                    <Text style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: emToTracking(0.12, 10.5), color: theme.sub }}>
                      {saved.category}
                    </Text>
                  )}
                </View>
                {/* Classification now runs in the background -- right after
                    saving, title/snippet/tags are still the 'pending'
                    placeholder (null/empty), not the real result, so this
                    shows an honest "분석 중" state instead of a blank title
                    or empty tag row. The list screen picks up the real
                    result once it's ready; this sheet doesn't wait for it. */}
                {saved.classification_status === 'pending' ? (
                  <>
                    {/* A text save already has its own content to show
                        (what was typed) -- only the AI-refined title/tags
                        are actually pending there, so this shows it as-is
                        rather than hiding it behind the spinner too. */}
                    {saved.raw_text && <Text style={[styles.title, { color: theme.ink }]}>{saved.raw_text}</Text>}
                    <View style={styles.analyzingRow}>
                      <ActivityIndicator size="small" color={theme.accent} />
                      <Text style={{ color: theme.sub, fontFamily: 'IBMPlexSansKR_400Regular', fontSize: 13.5 }}>
                        제목·태그를 분석하고 있어요
                      </Text>
                    </View>
                  </>
                ) : (
                  <>
                    <Text style={[styles.title, { color: theme.ink }]}>{saved.title ?? saved.raw_text}</Text>
                    {saved.snippet && <Text style={[styles.snippet, { color: theme.sub }]}>{saved.snippet}</Text>}
                  </>
                )}
              </View>

              {saved.classification_status !== 'pending' && (
                <>
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
                </>
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
  noteRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 },
  noteInput: { marginTop: 0, minHeight: 0, paddingVertical: 12, fontSize: 13.5 },
  analyzingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  savingButton: { flex: 1, borderRadius: 999, borderWidth: 1, paddingVertical: 14, alignItems: 'center' },
  screenshotSection: { marginTop: 18 },
  bulkHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  bulkTagRow: { marginTop: 10 },
  newTagBox: { borderWidth: 1, borderStyle: 'dashed', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6, alignSelf: 'flex-start' },
  screenshotLabel: { fontSize: 12.5, marginBottom: 8, fontFamily: 'IBMPlexSansKR_400Regular' },
  permissionHintText: { fontSize: 13, lineHeight: 19, fontFamily: 'IBMPlexSansKR_400Regular' },
  permissionHintLink: { fontFamily: 'IBMPlexSansKR_500Medium', marginTop: 6, textDecorationLine: 'underline' },
  screenshotRow: { flexDirection: 'row', gap: 8 },
  screenshotThumb: { width: 64, height: 64, borderRadius: 10, borderWidth: 1 },
  screenshotCheck: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bulkResultList: { marginTop: 18, maxHeight: 220 },
  bulkResultRow: { paddingVertical: 10, paddingHorizontal: 12, marginBottom: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  bulkResultTitle: { flex: 1, fontSize: 13.5, fontFamily: 'IBMPlexSansKR_400Regular' },
  deleteOriginalRow: { marginTop: 14, alignItems: 'center' },
  deleteOriginalText: { fontSize: 12.5, fontFamily: 'IBMPlexSansKR_400Regular' },
  deleteOriginalLink: { textDecorationLine: 'underline' },
});
