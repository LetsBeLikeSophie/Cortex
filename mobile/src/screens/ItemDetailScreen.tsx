import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextStyle,
  View,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useTheme } from '../theme/ThemeContext';
import { MONO, emToTracking } from '../theme/themes';
import { addTag, asQuotaError, deleteItem, fetchItem, getScreenshotUrl, reorganizeItem, removeAiTag as removeAiTagApi, removeTag as removeTagApi, tagFromVoice, updateItem, friendlyError } from '../api/client';
import { relativeTime, sourceLabel, captureTypeLabel } from '../api/format';
import { TagChip, TagAddChip } from '../components/Chips';
import { ButtonRow, GhostButton, SolidButton } from '../components/Buttons';
import { pickStyle, pickTextStyle } from '../components/Fields';
import { RestoreIcon, TrashIcon, SourceIcon } from '../components/Icons';
import { ModalSheet } from '../components/ModalSheet';
import { ConfirmCard } from '../components/ConfirmCard';
import { ImageViewer } from '../components/ImageViewer';
import { VoiceInputButton } from '../components/VoiceInputButton';
import { Heading } from '../components/Typography';
import type { RootStackParamList } from '../navigation/types';

type DeleteState = 'idle' | 'confirming' | 'deleting';
type EditField = 'title' | 'snippet' | 'rawText';

const REORGANIZE_POLL_MS = 2000;

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

  // Title / memo / body are editable in place: tap the text, it becomes an
  // input, leaving it (blur or done) saves. For screenshots and links the
  // body is the AI memo (snippet); for a text memo it's the text itself.
  const [title, setTitle] = useState(item.title ?? '');
  const [snippet, setSnippet] = useState(item.snippet ?? '');
  const [rawText, setRawText] = useState(item.raw_text ?? '');
  const [category, setCategory] = useState(item.category);
  // What the server has for each field, and -- after a change -- what it
  // was before, so the undo icon next to the field can put it back.
  const savedRef = useRef<Record<EditField, string>>({ title: item.title ?? '', snippet: item.snippet ?? '', rawText: item.raw_text ?? '' });
  const [undo, setUndo] = useState<Partial<Record<EditField, string>>>({});
  const [editError, setEditError] = useState('');
  const [organizing, setOrganizing] = useState(item.classification_status === 'pending');

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

  // Same formula as <Heading offset={4}>, for the title's inline input.
  const headSize = theme.headSize - 4;
  const headingStyle = {
    fontFamily: theme.headFamily,
    fontWeight: theme.headWeight,
    fontSize: headSize,
    // Android's multiline EditText with a lineHeight tighter than the
    // font's own metrics keeps re-measuring as the cursor blinks -- let it
    // use the font's natural line height there.
    ...(Platform.OS === 'android' ? null : { lineHeight: headSize * 1.15 }),
    letterSpacing: emToTracking(-0.02, headSize),
    color: theme.ink,
    marginTop: 10,
  };

  // While a re-organize runs on the server, check back until it lands, then
  // show the new title/memo/tags.
  useEffect(() => {
    if (!organizing) return;
    let cancelled = false;
    const timer = setInterval(() => {
      fetchItem(item.id)
        .then((fresh) => {
          if (cancelled || fresh.classification_status === 'pending') return;
          setOrganizing(false);
          // The AI's rewrite can be undone like a manual edit.
          const before = savedRef.current;
          savedRef.current = { title: fresh.title ?? '', snippet: fresh.snippet ?? '', rawText: fresh.raw_text ?? '' };
          setUndo({
            ...(before.title !== savedRef.current.title ? { title: before.title } : null),
            ...(before.snippet !== savedRef.current.snippet ? { snippet: before.snippet } : null),
          });
          setTitle(fresh.title ?? '');
          setSnippet(fresh.snippet ?? '');
          setRawText(fresh.raw_text ?? '');
          setCategory(fresh.category);
          setAiTags(fresh.tags);
          setUserTags(fresh.user_tags);
          if (fresh.classification_status === 'unclassified') setEditError('AI 정리에 실패했어요. 잠시 후 다시 시도해 주세요.');
        })
        .catch(() => {});
    }, REORGANIZE_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [organizing, item.id]);

  const valueOf = (field: EditField) => (field === 'title' ? title : field === 'snippet' ? snippet : rawText);
  const setterOf = (field: EditField) => (field === 'title' ? setTitle : field === 'snippet' ? setSnippet : setRawText);

  const save = (field: EditField, next: string, undoTo: string | undefined) => {
    const previous = savedRef.current[field];
    const previousUndo = undo[field];
    savedRef.current[field] = next;
    setterOf(field)(next);
    setUndo((u) => {
      const copy = { ...u };
      if (undoTo === undefined) delete copy[field];
      else copy[field] = undoTo;
      return copy;
    });
    updateItem(item.id, { [field]: next }).catch((err) => {
      // Nothing changed on the server, so put the undo state back as well.
      savedRef.current[field] = previous;
      setterOf(field)(previous);
      setUndo((u) => {
        const copy = { ...u };
        if (previousUndo === undefined) delete copy[field];
        else copy[field] = previousUndo;
        return copy;
      });
      setEditError(friendlyError(err));
    });
  };

  // Typing goes straight into the text on screen (no edit box); leaving the
  // field saves it, and the old text becomes the undo target.
  const commit = (field: EditField) => {
    const next = valueOf(field).trim();
    const previous = savedRef.current[field];
    if (next === previous) return;
    setEditError('');
    save(field, next, previous);
  };

  const undoEdit = (field: EditField) => {
    const target = undo[field];
    if (target === undefined) return;
    save(field, target, undefined);
  };

  const undoButton = (field: EditField) =>
    undo[field] !== undefined && !organizing ? (
      <Pressable onPress={() => undoEdit(field)} hitSlop={10} style={styles.undo} accessibilityLabel="되돌리기">
        <RestoreIcon size={16} color={theme.sub} strokeWidth={1.4} />
      </Pressable>
    ) : null;

  // A TextInput dressed exactly like the text it replaces -- tapping just
  // puts the cursor in, nothing on screen changes shape.
  const inlineInput = (field: EditField, textStyle: object, placeholder: string) => {
    const input = (
      <TextInput
        value={valueOf(field)}
        onChangeText={setterOf(field)}
        onBlur={() => commit(field)}
        multiline
        scrollEnabled={false}
        blurOnSubmit={field === 'title'}
        editable={!organizing}
        placeholder={placeholder}
        placeholderTextColor={theme.sub}
        underlineColorAndroid="transparent"
        style={[textStyle, styles.inline, Platform.OS === 'web' && [styles.inlineWebFill, { top: (StyleSheet.flatten(textStyle) as TextStyle).marginTop ?? 0 }]]}
      />
    );
    if (Platform.OS !== 'web') return input;
    // Web's multiline TextInput is a fixed-height textarea that never shrinks
    // back. An invisible copy of the text gives the box its height (grows and
    // shrinks with the words), and the input fills that box.
    return (
      <View>
        <Text style={[textStyle, styles.inlineMirror]} aria-hidden>
          {valueOf(field) || placeholder || ' '}
        </Text>
        {input}
      </View>
    );
  };

  const reorganize = async () => {
    if (organizing) return;
    setEditError('');
    try {
      await reorganizeItem(item.id);
      setOrganizing(true);
    } catch (err) {
      if (asQuotaError(err)) {
        navigation.navigate('Paywall', { reason: 'classify' });
        return;
      }
      setEditError(friendlyError(err));
    }
  };

  // Optimistic: the tag chip disappears/appears immediately, and rolls back
  // if the server call fails rather than leaving the UI ahead of reality.
  const removeTag = (tag: string) => {
    setUserTags((current) => current.filter((t) => t !== tag));
    setTagError('');
    removeTagApi(item.id, tag).catch((err) => {
      setUserTags((current) => [...current, tag]);
      setTagError(friendlyError(err));
    });
  };

  const removeAiTag = (tag: string) => {
    setAiTags((current) => current.filter((t) => t !== tag));
    setTagError('');
    removeAiTagApi(item.id, tag).catch((err) => {
      setAiTags((current) => [...current, tag]);
      setTagError(friendlyError(err));
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
      setTagError(friendlyError(err));
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
        setTagError(friendlyError(err));
      });
    } catch (err) {
      setTagError(friendlyError(err));
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
      setDeleteError(friendlyError(err));
      setDeleteState('confirming');
    }
  };

  return (
    <>
    <ModalSheet theme={theme} onClose={close} paddingBottom={24} maxHeightRatio={0.82} grabberMarginBottom={20} liftForKeyboard>
        {/* This sheet is a native-stack "transparentModal", which on Android
            react-native-screens renders inside a BottomSheetDialog -- a
            separate Dialog window that does NOT inherit the Activity's
            windowSoftInputMode="adjustResize" from AndroidManifest.xml
            (confirmed: ScreenModalFragment never calls
            getWindow().setSoftInputMode). The OS never resizes around the
            keyboard here on either platform. ModalSheet's liftForKeyboard
            does the work: a KeyboardAvoidingView here re-measured itself on
            every cursor blink while editing the title and the sheet
            flickered between two positions (Z Flip). */}
        <View style={styles.flexShrink}>
        <ScrollView ref={scrollRef} style={styles.flexShrink} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View style={styles.metaRow}>
            {/* Category is the one piece of info this screen only ever shows
                in this one spot -- source/capture type moved to the footer
                near the timestamp, see below. */}
            <Text style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: emToTracking(0.12, 10.5), color: theme.sub }}>
              {category}
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
            <ConfirmCard
              theme={theme}
              title="휴지통으로 이동할까요?"
              body="나중에 복원할 수 있어요."
              confirmLabel="삭제"
              busy={deleteState === 'deleting'}
              error={deleteError ? `삭제 실패: ${deleteError}` : undefined}
              onCancel={() => setDeleteState('idle')}
              onConfirm={confirmDelete}
            />
          )}

          <View style={styles.editRow}>
            <View style={styles.flex1}>
              {inlineInput('title', headingStyle, organizing ? 'AI가 정리하는 중...' : rawText.slice(0, 40) || '제목 없음')}
            </View>
            {undoButton('title')}
          </View>

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
              variant="chip"
              onResult={(text, isFinal) => {
                if (isFinal) submitVoiceTag(text);
              }}
            />
            {voiceTagLoading && <ActivityIndicator size="small" color={theme.accent} style={styles.voiceTagSpinner} />}
          </ScrollView>
          {tagError !== '' && <Text style={[styles.errorText, { color: theme.danger }]}>태그 저장 실패: {tagError}</Text>}

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

          {item.capture_type !== 'text' && (
            <View style={styles.editRow}>
              <View style={styles.flex1}>{inlineInput('snippet', [styles.body, { color: theme.sub }], organizing ? '' : '메모 없음')}</View>
              {undoButton('snippet')}
            </View>
          )}

          {/* The user's own "why I saved this" -- kept visually distinct
              (italic, accent-colored) from the AI snippet above it, since
              it's their words, not a generated summary. */}
          {item.user_note && (
            <Text style={[styles.body, { color: theme.accent, fontStyle: 'italic', marginTop: snippet ? 4 : 0 }]}>
              "{item.user_note}"
            </Text>
          )}

          {item.capture_type === 'text' && (
            <View style={styles.editRow}>
              <View style={styles.flex1}>{inlineInput('rawText', [styles.body, { color: theme.ink }], '본문 없음')}</View>
              {undoButton('rawText')}
            </View>
          )}

          {editError !== '' && <Text style={[styles.errorText, { color: theme.danger }]}>{editError}</Text>}

          {/* Rewrite the title/memo however you like (or clear them), then
              let the AI redo it with your version as the guide. */}
          <Pressable onPress={reorganize} disabled={organizing} style={[styles.reorganize, pickStyle(theme)]}>
            {organizing ? (
              <ActivityIndicator size="small" color={theme.accent} />
            ) : (
              <Text style={pickTextStyle(theme)}>✦ AI로 다시 정리</Text>
            )}
          </Pressable>

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
        </View>

        <ButtonRow theme={theme} style={styles.buttonRow}>
          {item.raw_url ? (
            <>
              <GhostButton label="닫기" theme={theme} onPress={close} />
              <SolidButton label="링크 열기" theme={theme} onPress={() => Linking.openURL(item.raw_url!)} />
            </>
          ) : (
            <SolidButton label="닫기" theme={theme} onPress={close} />
          )}
        </ButtonRow>
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
  inline: { padding: 0, paddingTop: 0, paddingBottom: 0, borderWidth: 0, textAlignVertical: 'top', outlineWidth: 0 } as object,
  inlineMirror: { opacity: 0 },
  // Placed under the mirror's top margin (top is set per field).
  inlineWebFill: { position: 'absolute', left: 0, right: 0, bottom: 0, marginTop: 0, overflow: 'hidden' } as object,
  editRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  flex1: { flex: 1 },
  undo: { marginTop: 14, padding: 2 },
  reorganize: { alignSelf: 'flex-start', marginTop: 16, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7, minWidth: 120, alignItems: 'center' },
  tagScroll: { marginTop: 16, flexGrow: 0 },
  // paddingVertical: same Android horizontal-ScrollView bottom-edge clip as
  // Home's tab strip -- outlined tag chips lost their bottom border.
  tagRow: { flexDirection: 'row', gap: 8, alignItems: 'center', paddingRight: 8, paddingVertical: 2 },
  newTagBox: { borderWidth: 1, borderStyle: 'dashed', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 },
  errorText: { fontSize: 12.5, marginTop: 8, fontFamily: 'IBMPlexSansKR_400Regular' },
  voiceTagSpinner: { marginLeft: 2 },
  timestamp: { fontSize: 12.5, marginTop: 18, marginBottom: 4, fontFamily: 'IBMPlexSansKR_400Regular' },
  footerMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  footerMetaText: { marginTop: 0 },
  buttonRow: { marginTop: 16 },
});
