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
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useTheme } from '../theme/ThemeContext';
import { MONO, emToTracking } from '../theme/themes';
import { addTag, deleteItem, getScreenshotUrl, removeAiTag as removeAiTagApi, removeTag as removeTagApi, tagFromVoice } from '../api/client';
import { relativeTime, sourceLabel, captureTypeLabel } from '../api/format';
import { TagChip, TagAddChip } from '../components/Chips';
import { GhostButton, SolidButton } from '../components/Buttons';
import { TrashIcon, SourceIcon } from '../components/Icons';
import { ModalSheet } from '../components/ModalSheet';
import { ImageViewer } from '../components/ImageViewer';
import { VoiceInputButton } from '../components/VoiceInputButton';
import { Heading } from '../components/Typography';
import type { RootStackParamList } from '../navigation/types';

type DeleteState = 'idle' | 'confirming' | 'deleting';

export default function ItemDetailScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'ItemDetail'>>();
  const tech = theme.copy === 'tech';
  const { item } = route.params;

  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageError, setImageError] = useState(false);
  const [viewerUri, setViewerUri] = useState<string | null>(null);

  const sourceText = sourceLabel(item.source, tech);
  const captureTypeText = captureTypeLabel(item.capture_type, tech);
  const channelMetaLabel = captureTypeText === sourceText ? sourceText : `${sourceText} · ${captureTypeText}`;

  const [aiTags, setAiTags] = useState(item.tags);
  const [userTags, setUserTags] = useState(item.user_tags);
  const [tagError, setTagError] = useState('');
  const [addingTag, setAddingTag] = useState(false);
  const [newTag, setNewTag] = useState('');
  const [voiceTagLoading, setVoiceTagLoading] = useState(false);

  const [deleteState, setDeleteState] = useState<DeleteState>('idle');
  const [deleteError, setDeleteError] = useState('');

  const scrollRef = useRef<ScrollView>(null);
  const tagScrollRef = useRef<ScrollView>(null);
  // TextInput's onSubmitEditing fires, then setAddingTag(false) below
  // unmounts it, which fires onBlur too -- both handlers call submitNewTag
  // in the same tick, before the newTag state clear has re-rendered, so
  // without this guard the same typed tag got added twice.
  const tagSubmittedRef = useRef(false);

  useEffect(() => {
    if (item.capture_type !== 'screenshot') return;
    let cancelled = false;
    getScreenshotUrl(item.id)
      .then(({ url }) => {
        if (!cancelled) setImageUrl(url);
      })
      .catch(() => {
        if (!cancelled) setImageError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [item.id, item.capture_type]);

  const close = () => navigation.goBack();

  // Optimistic: the tag chip disappears/appears immediately, and rolls back
  // if the server call fails rather than leaving the UI ahead of reality.
  const removeTag = (tag: string) => {
    setUserTags((current) => current.filter((t) => t !== tag));
    setTagError('');
    removeTagApi(item.id, tag).catch((err) => {
      setUserTags((current) => [...current, tag]);
      setTagError(err instanceof Error ? err.message : String(err));
    });
  };

  const removeAiTag = (tag: string) => {
    setAiTags((current) => current.filter((t) => t !== tag));
    setTagError('');
    removeAiTagApi(item.id, tag).catch((err) => {
      setAiTags((current) => [...current, tag]);
      setTagError(err instanceof Error ? err.message : String(err));
    });
  };

  const openTagInput = () => {
    tagSubmittedRef.current = false;
    setAddingTag(true);
    // The input box mounts at the end of the (now horizontally scrolling)
    // tag row -- with enough tags already in it, "+ 태그" itself might be
    // scrolled out of view when tapped from a swiped-over position.
    setTimeout(() => tagScrollRef.current?.scrollToEnd({ animated: true }), 50);
  };

  const submitNewTag = () => {
    if (tagSubmittedRef.current) return;
    tagSubmittedRef.current = true;

    const trimmed = newTag.trim();
    setAddingTag(false);
    setNewTag('');
    if (!trimmed || aiTags.includes(trimmed) || userTags.includes(trimmed)) return;
    setUserTags((current) => [...current, trimmed]);
    setTagError('');
    addTag(item.id, trimmed).catch((err) => {
      setUserTags((current) => current.filter((t) => t !== trimmed));
      setTagError(err instanceof Error ? err.message : String(err));
    });
  };

  // A spoken sentence ("이건 엄마 생신 선물 후보야") almost never reads as a
  // clean tag on its own, so this goes through tagFromVoice's small cleanup
  // call first, then adds the result the same optimistic way submitNewTag
  // does. Only called with the *final* transcript, not every partial one.
  const submitVoiceTag = async (spokenText: string) => {
    const trimmedSpoken = spokenText.trim();
    if (!trimmedSpoken) return;
    setVoiceTagLoading(true);
    setTagError('');
    try {
      const { tag } = await tagFromVoice(trimmedSpoken);
      const trimmed = tag.trim();
      if (!trimmed || aiTags.includes(trimmed) || userTags.includes(trimmed)) return;
      setUserTags((current) => [...current, trimmed]);
      addTag(item.id, trimmed).catch((err) => {
        setUserTags((current) => current.filter((t) => t !== trimmed));
        setTagError(err instanceof Error ? err.message : String(err));
      });
    } catch (err) {
      setTagError(err instanceof Error ? err.message : String(err));
    } finally {
      setVoiceTagLoading(false);
    }
  };

  const confirmDelete = async () => {
    setDeleteState('deleting');
    try {
      await deleteItem(item.id);
      close();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : String(err));
      setDeleteState('confirming');
    }
  };

  return (
    <>
    <ModalSheet theme={theme} onClose={close} paddingBottom={24} maxHeightRatio={0.82} grabberMarginBottom={20}>
        {/* This sheet is a native-stack "transparentModal", which on Android
            react-native-screens renders inside a BottomSheetDialog -- a
            separate Dialog window that does NOT inherit the Activity's
            windowSoftInputMode="adjustResize" from AndroidManifest.xml
            (confirmed: ScreenModalFragment never calls
            getWindow().setSoftInputMode). The OS never resizes around the
            keyboard here on either platform, so this actually has to do the
            work on both. */}
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flexShrink}>
        <ScrollView ref={scrollRef} style={styles.flexShrink} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View style={styles.metaRow}>
            {/* Category is the one piece of info this screen only ever shows
                in this one spot -- source/capture type moved to the footer
                near the timestamp, see below. */}
            <Text style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: emToTracking(0.12, 10.5), color: theme.sub }}>
              {item.category}
            </Text>
            <Pressable
              onPress={() => setDeleteState('confirming')}
              hitSlop={8}
              style={[styles.trashButton, { borderColor: theme.line }]}
            >
              <TrashIcon size={13.5} color={theme.sub} strokeWidth={1.3} />
            </Pressable>
          </View>

          {deleteState !== 'idle' && (
            <View style={[styles.deleteConfirmCard, { borderColor: theme.line }]}>
              <Text style={[styles.deleteConfirmText, { color: theme.ink }]}>휴지통으로 이동할까요? 나중에 복원할 수 있어요.</Text>
              {deleteError !== '' && (
                <Text style={[styles.errorText, { color: theme.accent }]}>삭제 실패: {deleteError}</Text>
              )}
              <View style={styles.deleteConfirmButtons}>
                <Pressable
                  onPress={() => setDeleteState('idle')}
                  disabled={deleteState === 'deleting'}
                  style={[styles.smallGhostButton, { borderColor: theme.line }]}
                >
                  <Text style={{ color: theme.ink, fontFamily: 'IBMPlexSansKR_500Medium', fontSize: 13.5 }}>취소</Text>
                </Pressable>
                <Pressable
                  onPress={confirmDelete}
                  disabled={deleteState === 'deleting'}
                  style={[styles.smallDeleteButton, { opacity: deleteState === 'deleting' ? 0.7 : 1 }]}
                >
                  {deleteState === 'deleting' ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={{ color: '#fff', fontFamily: 'IBMPlexSansKR_500Medium', fontSize: 13.5 }}>삭제</Text>
                  )}
                </Pressable>
              </View>
            </View>
          )}

          <Heading theme={theme} offset={4} style={{ marginTop: 10 }}>
            {item.title ?? item.raw_text?.slice(0, 40) ?? (item.classification_status === 'pending' ? '분석 중...' : '(제목 없음)')}
          </Heading>

          {/* Horizontal instead of wrapping -- with enough tags, a wrapping
              row grows tall and pushes the image/description further down
              every time one more tag gets added. This stays a fixed height
              and scrolls sideways instead. */}
          <ScrollView
            ref={tagScrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.tagScroll}
            contentContainerStyle={styles.tagRow}
          >
            {aiTags.map((tag) => (
              <TagChip key={tag} label={tag} theme={theme} tone="auto" onRemove={() => removeAiTag(tag)} />
            ))}
            {userTags.map((tag) => (
              <TagChip key={tag} label={tag} theme={theme} onRemove={() => removeTag(tag)} />
            ))}
            {addingTag ? (
              <View style={[styles.newTagBox, { borderColor: theme.line }]}>
                <TextInput
                  value={newTag}
                  onChangeText={setNewTag}
                  autoFocus
                  onFocus={() => scrollRef.current?.scrollTo({ y: 0, animated: true })}
                  onSubmitEditing={submitNewTag}
                  onBlur={submitNewTag}
                  placeholder="새 태그"
                  placeholderTextColor={theme.sub}
                  style={{ color: theme.ink, fontFamily: 'IBMPlexSansKR_400Regular', fontSize: 13, padding: 0, minWidth: 60, outlineWidth: 0 }}
                />
              </View>
            ) : (
              <TagAddChip label="+ 태그" theme={theme} onPress={openTagInput} />
            )}
            <VoiceInputButton
              theme={theme}
              size={14}
              onResult={(text, isFinal) => {
                if (isFinal) submitVoiceTag(text);
              }}
            />
            {voiceTagLoading && <ActivityIndicator size="small" color={theme.accent} style={styles.voiceTagSpinner} />}
          </ScrollView>
          {tagError !== '' && <Text style={[styles.errorText, { color: theme.accent }]}>태그 저장 실패: {tagError}</Text>}

          {item.capture_type === 'screenshot' && (
            <View style={[styles.imageBox, { backgroundColor: theme.soft, borderColor: theme.line }]}>
              {imageError ? (
                <Text style={{ color: theme.sub, fontFamily: 'IBMPlexSansKR_400Regular', padding: 24 }}>
                  이미지를 불러오지 못했어요.
                </Text>
              ) : imageUrl ? (
                // The box below crops to a square ("cover") so the list of
                // saves stays tidy, which on a typically tall phone
                // screenshot cuts off real content -- tapping through to
                // the full-screen viewer (resizeMode "contain") is the only
                // place the whole image is actually visible.
                <Pressable onPress={() => setViewerUri(imageUrl)}>
                  <Image source={{ uri: imageUrl }} style={styles.image} resizeMode="cover" />
                </Pressable>
              ) : (
                <ActivityIndicator color={theme.accent} style={{ padding: 40 }} />
              )}
            </View>
          )}

          {item.capture_type === 'link' && item.thumbnail_url && (
            // Already a public URL the site published for its own link
            // previews -- no signed-URL fetch needed, unlike screenshots.
            <View style={[styles.imageBox, { backgroundColor: theme.soft, borderColor: theme.line }]}>
              <Pressable onPress={() => setViewerUri(item.thumbnail_url)}>
                <Image source={{ uri: item.thumbnail_url }} style={styles.image} resizeMode="cover" />
              </Pressable>
            </View>
          )}

          {item.snippet && <Text style={[styles.body, { color: theme.sub }]}>{item.snippet}</Text>}

          {/* The user's own "why I saved this" -- kept visually distinct
              (italic, accent-colored) from the AI snippet above it, since
              it's their words, not a generated summary. */}
          {item.user_note && (
            <Text style={[styles.body, { color: theme.accent, fontStyle: 'italic', marginTop: item.snippet ? 4 : 0 }]}>
              "{item.user_note}"
            </Text>
          )}

          {item.capture_type === 'text' && item.raw_text && (
            <Text style={[styles.body, { color: theme.ink }]}>{item.raw_text}</Text>
          )}

          {item.raw_url && (
            <Pressable onPress={() => Linking.openURL(item.raw_url!)} style={styles.linkRow}>
              <Text style={{ color: theme.accent, fontFamily: 'IBMPlexSansKR_500Medium', fontSize: 13.5 }} numberOfLines={1}>
                {item.raw_url}
              </Text>
            </Pressable>
          )}

          {/* Source + capture type moved out of the tag row above -- this is
              the same "channel · how" fact the list row's MetaLine already
              shows, just phrased here as metadata next to the timestamp
              instead of as a removable-looking chip competing with tags.
              The two labels happen to coincide for a hand-typed memo (source
              'memo', capture type 'text' -- both read "메모" in Korean), so
              skip the repeat rather than show the same word twice. */}
          <View style={styles.footerMeta}>
            <SourceIcon source={item.source} size={11} color={theme.sub} strokeWidth={1.3} />
            <Text style={[styles.timestamp, styles.footerMetaText, { color: theme.sub }]}>
              {channelMetaLabel} · {relativeTime(item.shared_at)} 저장됨
            </Text>
          </View>
        </ScrollView>
        </KeyboardAvoidingView>

        <View style={styles.buttonRow}>
          {item.raw_url ? (
            <>
              <GhostButton label="닫기" theme={theme} onPress={close} />
              <SolidButton label="링크 열기" theme={theme} onPress={() => Linking.openURL(item.raw_url!)} />
            </>
          ) : (
            <SolidButton label="닫기" theme={theme} onPress={close} />
          )}
        </View>
    </ModalSheet>
    <ImageViewer uri={viewerUri} onClose={() => setViewerUri(null)} />
    </>
  );
}

const styles = StyleSheet.create({
  flexShrink: { flexShrink: 1 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  trashButton: { width: 24, height: 24, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  imageBox: { marginTop: 16, borderRadius: 14, borderWidth: 1, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  image: { width: '100%', aspectRatio: 1 },
  body: { fontSize: 14.5, lineHeight: 22.5, marginTop: 14, fontFamily: 'IBMPlexSansKR_400Regular' },
  linkRow: { marginTop: 14 },
  tagScroll: { marginTop: 16, flexGrow: 0 },
  tagRow: { flexDirection: 'row', gap: 8, alignItems: 'center', paddingRight: 8 },
  newTagBox: { borderWidth: 1, borderStyle: 'dashed', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 },
  errorText: { fontSize: 12.5, marginTop: 8, fontFamily: 'IBMPlexSansKR_400Regular' },
  voiceTagSpinner: { marginLeft: 2 },
  timestamp: { fontSize: 12.5, marginTop: 18, marginBottom: 4, fontFamily: 'IBMPlexSansKR_400Regular' },
  footerMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  footerMetaText: { marginTop: 0 },
  deleteConfirmCard: { borderWidth: 1, borderRadius: 14, padding: 14, marginTop: 14 },
  deleteConfirmText: { fontSize: 13.5, fontFamily: 'IBMPlexSansKR_500Medium' },
  deleteConfirmButtons: { flexDirection: 'row', gap: 10, marginTop: 12 },
  smallGhostButton: { flex: 1, borderWidth: 1, borderRadius: 999, paddingVertical: 10, alignItems: 'center' },
  smallDeleteButton: { flex: 1, backgroundColor: '#c0392b', borderRadius: 999, paddingVertical: 10, alignItems: 'center' },
  buttonRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
});
