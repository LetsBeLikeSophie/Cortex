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
import { addTag, asQuotaError, deleteItem, fetchItem, fetchPlan, getScreenshotUrl, reorganizeItem, removeAiTag as removeAiTagApi, removeTag as removeTagApi, updateItem, friendlyError } from '../api/client';
import { relativeTime, sourceLabel, captureTypeLabel } from '../api/format';
import { TagChip, TagAddChip } from '../components/Chips';
import { ButtonRow, GhostButton, IconButton, SolidButton } from '../components/Buttons';
import { SparkleIcon, TrashIcon, SourceIcon } from '../components/Icons';
import { ModalSheet } from '../components/ModalSheet';
import { ConfirmCard } from '../components/ConfirmCard';
import { ImageViewer } from '../components/ImageViewer';
import { VoiceInputButton } from '../components/VoiceInputButton';
import { Heading } from '../components/Typography';
import type { ApiItem } from '../api/client';
import type { RootStackParamList } from '../navigation/types';

type DeleteState = 'idle' | 'confirming' | 'deleting';
// snippet (the AI memo) isn't typed into -- it's only ever replaced by the
// AI or put back with undo -- but it shares the save/undo plumbing.
type EditField = 'title' | 'snippet' | 'rawText' | 'userNote';

const REORGANIZE_POLL_MS = 2000;
const SNACK_MS = 6000;

// "<field>을/를 바꿨어요" for the undo bar after a manual edit.
const EDITED_MESSAGE: Record<EditField, string> = {
  title: '제목을 바꿨어요',
  snippet: 'AI 메모를 바꿨어요',
  rawText: '본문을 바꿨어요',
  userNote: '내 메모를 바꿨어요',
};

export default function ItemDetailScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'ItemDetail'>>();
  const { item, composedFrom } = route.params;

  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageError, setImageError] = useState(false);
  const [viewerUri, setViewerUri] = useState<string | null>(null);

  const sourceText = sourceLabel(item.source, false);
  const captureTypeText = captureTypeLabel(item.capture_type, false);
  const channelMetaLabel = captureTypeText === sourceText ? sourceText : `${sourceText} · ${captureTypeText}`;

  const [aiTags, setAiTags] = useState(item.tags);
  const [userTags, setUserTags] = useState(item.user_tags);
  const [tagError, setTagError] = useState('');
  const [addingTag, setAddingTag] = useState(false);
  const [newTag, setNewTag] = useState('');

  // What's typed into, in place (tap the text; leaving it saves): the title,
  // and the person's own words -- "내 메모" (user_note) on a screenshot or
  // link, the body itself on a text memo. Both also take the mic. The AI
  // memo (snippet) is read-only: it's search text, and ✦ rewrites it.
  const [title, setTitle] = useState(item.title ?? '');
  const [snippet, setSnippet] = useState(item.snippet ?? '');
  const [rawText, setRawText] = useState(item.raw_text ?? '');
  const [userNote, setUserNote] = useState(item.user_note ?? '');
  // What was in the field when a recording started -- speech appends to it.
  const voiceBaseRef = useRef('');
  const [category, setCategory] = useState(item.category);
  // What the server has for each field (the baseline an edit is compared to).
  const savedRef = useRef<Record<EditField, string>>({
    title: item.title ?? '',
    snippet: item.snippet ?? '',
    rawText: item.raw_text ?? '',
    userNote: item.user_note ?? '',
  });
  // Undo lives in one bar at the bottom that shows for a few seconds after
  // a change (manual edit or AI re-organize) and undoes that whole change --
  // no per-field undo icons.
  // undo is absent when there's nothing to go back to (an item's first
  // organize, not a re-organize) -- the bar then only informs.
  const [snack, setSnack] = useState<{ message: string; undo?: () => void } | null>(null);
  const snackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // What an AI re-organize is about to replace, so its undo can put it all back.
  const beforeAiRef = useRef<{ title: string; snippet: string; category: ApiItem['category']; tags: string[] } | null>(null);
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
          savedRef.current = { ...savedRef.current, title: fresh.title ?? '', snippet: fresh.snippet ?? '', rawText: fresh.raw_text ?? '' };
          setTitle(fresh.title ?? '');
          setSnippet(fresh.snippet ?? '');
          setRawText(fresh.raw_text ?? '');
          setCategory(fresh.category);
          setAiTags(fresh.tags);
          setUserTags(fresh.user_tags);
          if (fresh.classification_status === 'unclassified') {
            setEditError('AI 정리에 실패했어요. 잠시 후 다시 시도해 주세요.');
            return;
          }
          // No snapshot = this was the item's first organize (opened while
          // still 분석 중), not a ✦ re-organize: nothing to undo or recount.
          const before = beforeAiRef.current;
          if (!before) {
            showSnack(item.capture_type === 'text' ? 'AI가 제목·태그를 달았어요' : 'AI가 제목·메모·태그를 달았어요', null);
            return;
          }
          const what = item.capture_type === 'text' ? '제목·태그를' : '제목·메모·태그를';
          fetchPlan()
            .then((p) => `AI가 ${what} 다시 정리했어요 · 이번 달 ${Math.max(0, p.classify.limit - p.classify.used)}건 남음`)
            .catch(() => `AI가 ${what} 다시 정리했어요`)
            .then((message) => showSnack(message, () => undoAi(before)));
        })
        .catch(() => {});
    }, REORGANIZE_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [organizing, item.id]);

  const valueOf = (field: EditField) => ({ title, snippet, rawText, userNote })[field];
  const setterOf = (field: EditField) => ({ title: setTitle, snippet: setSnippet, rawText: setRawText, userNote: setUserNote })[field];

  const showSnack = (message: string, undo: (() => void) | null) => {
    if (snackTimer.current) clearTimeout(snackTimer.current);
    setSnack(undo ? { message, undo } : { message });
    snackTimer.current = setTimeout(() => setSnack(null), SNACK_MS);
  };
  const hideSnack = () => {
    if (snackTimer.current) clearTimeout(snackTimer.current);
    setSnack(null);
  };
  useEffect(
    () => () => {
      if (snackTimer.current) clearTimeout(snackTimer.current);
    },
    []
  );

  // Saves one field; on success hands the previous value to onSaved (which
  // offers the undo bar). A failed save puts the old text back.
  const save = (field: EditField, next: string, onSaved?: (previous: string) => void) => {
    const previous = savedRef.current[field];
    savedRef.current[field] = next;
    setterOf(field)(next);
    updateItem(item.id, { [field]: next })
      .then(() => onSaved?.(previous))
      .catch((err) => {
        savedRef.current[field] = previous;
        setterOf(field)(previous);
        setEditError(friendlyError(err));
      });
  };

  // Typing goes straight into the text on screen (no edit box); leaving the
  // field saves it and offers a few seconds to undo.
  const commit = (field: EditField, value = valueOf(field)) => {
    const next = value.trim();
    if (next === savedRef.current[field]) return;
    setEditError('');
    save(field, next, (previous) =>
      showSnack(EDITED_MESSAGE[field], () => {
        hideSnack();
        save(field, previous);
      })
    );
  };

  // Undo for an AI re-organize: everything it replaced, in one request.
  const undoAi = (before: NonNullable<typeof beforeAiRef.current>) => {
    hideSnack();
    const now = { title: savedRef.current.title, snippet: savedRef.current.snippet, category, tags: aiTags };
    savedRef.current = { ...savedRef.current, title: before.title, snippet: before.snippet };
    setTitle(before.title);
    setSnippet(before.snippet);
    setCategory(before.category);
    setAiTags(before.tags);
    updateItem(item.id, { title: before.title, snippet: before.snippet, category: before.category, tags: before.tags }).catch((err) => {
      savedRef.current = { ...savedRef.current, title: now.title, snippet: now.snippet };
      setTitle(now.title);
      setSnippet(now.snippet);
      setCategory(now.category);
      setAiTags(now.tags);
      setEditError(friendlyError(err));
    });
  };

  const voiceButton = (field: EditField) => (
    <View style={styles.micSlot}>
      <VoiceInputButton
        theme={theme}
        size={16}
        onStart={() => {
          const current = valueOf(field);
          voiceBaseRef.current = current.trim() ? `${current.trimEnd()} ` : '';
        }}
        onResult={(spoken, isFinal) => {
          const text = voiceBaseRef.current + spoken;
          setterOf(field)(text);
          if (isFinal) commit(field, text);
        }}
      />
    </View>
  );

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
      beforeAiRef.current = { title: savedRef.current.title, snippet: savedRef.current.snippet, category, tags: aiTags };
      hideSnack();
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

  const sparkleButton = (
    <IconButton theme={theme} on="sheet" onPress={reorganize} label="AI로 다시 정리">
      {organizing ? <ActivityIndicator size="small" color={theme.accent} /> : <SparkleIcon size={15} color={theme.accent} strokeWidth={1.4} />}
    </IconButton>
  );

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
            <View style={styles.headerActions}>
              {/* Rewrite the title/memo/tags with the person's own words as the
                  guide (see pipeline.ts hintFor). Same ✦ as sentence search. */}
              {/* On a fresh 모아서 만들기 result the header ✦ ("re-tag", 1 AI
                  organize) read as "make it again" -- that's the 다른 형식으로
                  link under the title instead. */}
              {item.capture_type === 'text' && !composedFrom && sparkleButton}
              <IconButton theme={theme} on="sheet" onPress={() => setDeleteState('confirming')} label="휴지통으로 이동">
                <TrashIcon size={14} color={theme.sub} strokeWidth={1.3} />
              </IconButton>
            </View>
          </View>

          {composedFrom && (
            <View style={styles.composedNote}>
              <SparkleIcon size={13} color={theme.accent} strokeWidth={1.5} />
              <Text style={[styles.composedText, { color: theme.sub }]}>
                {`'${composedFrom.tag}' 메모 ${composedFrom.count}개로 만들었어요`}
                {composedFrom.left !== undefined ? ` · 이번 달 ${composedFrom.left}회 남음` : ''}
              </Text>
              <Pressable
                onPress={() => navigation.replace('Compose', { tag: composedFrom.tag, count: composedFrom.count })}
                hitSlop={8}
                style={styles.composedAgain}
              >
                <Text style={[styles.composedText, { color: theme.ink, textDecorationLine: 'underline' }]}>다른 형식으로 →</Text>
              </Pressable>
            </View>
          )}

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

          {/* The AI's own memo, with the ✦ that rewrites it (and the title,
              category and AI tags with it) right where its words are. */}
          {item.capture_type !== 'text' && (
            <View style={styles.aiMemo}>
              <View style={styles.aiMemoHead}>
                <Text style={[styles.aiMemoLabel, { color: theme.sub }]}>AI 메모</Text>
                {sparkleButton}
              </View>
              {/* Empty/working state in sub italic -- theme.line was ~1.1-1.3:1, unreadable. */}
              <Text style={[styles.body, styles.aiMemoText, { color: theme.sub, fontStyle: snippet ? 'normal' : 'italic' }]}>
                {snippet || (organizing ? 'AI가 정리하는 중...' : '아직 AI 메모가 없어요')}
              </Text>
            </View>
          )}

          {/* The person's own words -- kept visually distinct (italic,
              accent) from the AI memo above, since it isn't generated. */}
          {item.capture_type !== 'text' && (
            <View style={styles.editRow}>
              <View style={styles.flex1}>
                {/* The person's own words: ink (accent is reserved for AI/status). */}
                {inlineInput('userNote', [styles.body, { color: theme.ink, fontStyle: 'italic' }], '내 메모 — 말하거나 눌러서 적어요')}
              </View>
              {voiceButton('userNote')}
            </View>
          )}

          {item.capture_type === 'text' && (
            <View style={styles.editRow}>
              <View style={styles.flex1}>{inlineInput('rawText', [styles.body, { color: theme.ink }], '본문 — 말하거나 눌러서 적어요')}</View>
              {voiceButton('rawText')}
            </View>
          )}

          {editError !== '' && <Text style={[styles.errorText, { color: theme.danger }]}>{editError}</Text>}


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

        {snack && (
          <View style={[styles.snack, { backgroundColor: theme.ink, borderRadius: Math.min(theme.pickRadius, 12) }]}>
            <Text style={[styles.snackText, { color: theme.bg }]} numberOfLines={2}>
              {snack.message}
            </Text>
            {snack.undo && (
              <Pressable onPress={snack.undo} hitSlop={10}>
                <Text style={[styles.snackAction, { color: theme.bg }]}>되돌리기</Text>
              </Pressable>
            )}
          </View>
        )}

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
  headerActions: { flexDirection: 'row', gap: 8 },
  micSlot: { marginTop: 10 },
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
  aiMemo: { marginTop: 16 },
  composedNote: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  composedAgain: { marginLeft: 'auto' },
  composedText: { fontSize: 12.5, fontFamily: 'IBMPlexSansKR_400Regular' },
  aiMemoHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  aiMemoLabel: { fontFamily: MONO, fontSize: 10.5, letterSpacing: 1.2 },
  aiMemoText: { marginTop: 6 },
  snack: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 11, marginTop: 12 },
  snackText: { flex: 1, fontSize: 13, lineHeight: 18, fontFamily: 'IBMPlexSansKR_400Regular' },
  snackAction: { fontSize: 13, fontFamily: 'IBMPlexSansKR_500Medium', textDecorationLine: 'underline' },
  tagScroll: { marginTop: 16, flexGrow: 0 },
  // paddingVertical: same Android horizontal-ScrollView bottom-edge clip as
  // Home's tab strip -- outlined tag chips lost their bottom border.
  tagRow: { flexDirection: 'row', gap: 8, alignItems: 'center', paddingRight: 8, paddingVertical: 2 },
  newTagBox: { borderWidth: 1, borderStyle: 'dashed', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 },
  errorText: { fontSize: 12.5, marginTop: 8, fontFamily: 'IBMPlexSansKR_400Regular' },
  timestamp: { fontSize: 12.5, marginTop: 18, marginBottom: 4, fontFamily: 'IBMPlexSansKR_400Regular' },
  footerMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  footerMetaText: { marginTop: 0 },
  buttonRow: { marginTop: 16 },
});
