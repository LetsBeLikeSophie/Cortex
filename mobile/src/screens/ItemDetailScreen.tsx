import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TextStyle,
  View,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useTheme } from '../theme/ThemeContext';
import { MONO, emToTracking, BODY_KR, BODY_KR_MEDIUM } from '../theme/themes';
import { forgetWeekly } from '../native/reminders';
import { addTag, asQuotaError, deleteItem, reportAiOutput, setItemLocked, fetchComposeSources, fetchItem, fetchPlan, getScreenshotUrl, reorganizeItem, removeAiTag as removeAiTagApi, removeTag as removeTagApi, updateItem, friendlyError, usesLeft } from '../api/client';
import { relativeTime, sourceLabel, captureTypeLabel, itemTitle, composeMaterials } from '../api/format';
import { TagChip, TagAddChip } from '../components/Chips';
import { FieldRow } from '../components/FieldRow';
import { Bubble } from '../components/Bubble';
import { ButtonRow, GhostButton, IconButton, SolidButton } from '../components/Buttons';
import { ConfirmPopup } from '../components/ConfirmPopup';
import { LockIcon, ReportIcon, ShareIcon, SparkleIcon, TrashIcon, SourceIcon } from '../components/Icons';
import { ModalSheet } from '../components/ModalSheet';
import { ConfirmCard } from '../components/ConfirmCard';
import { ImageViewer } from '../components/ImageViewer';
import { MemoText, refsIn, plainMemo } from '../components/MemoText';
import { VoiceInputButton } from '../components/VoiceInputButton';
import { Heading, SHEET_TITLE_SIZE } from '../components/Typography';
import type { ApiItem } from '../api/client';
import type { RootStackParamList } from '../navigation/types';
import { showToast } from '../native/toast';
import { COMMON, USES, categoryLabel } from '../i18n/common';
import { LOCK_SUPPORTED, askPin, hasPin } from '../lock/memoLock';
import { tagsOpen } from '../lock/tagLock';
import { S, type EditField } from './ItemDetailScreen.strings';

type DeleteState = 'idle' | 'confirming' | 'deleting';
// The server's limits (UpdateItemSchema): typing or speaking stops here,
// so a save never bounces and takes the new text back with it.
const FIELD_MAX: Record<EditField, number> = { title: 200, snippet: 1000, rawText: 200_000, userNote: 1000 };

const REORGANIZE_POLL_MS = 2000;
const SNACK_MS = 6000;

// S.edited: "<field>을/를 바꿨어요" for the undo bar after a manual edit.

export default function ItemDetailScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'ItemDetail'>>();
  const { item, composedFrom, remadeFrom } = route.params;

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
  // Changed by hand on this screen -- a remake's sheet warns those go too.
  const handEdited = useRef(false);
  // What an AI re-organize is about to replace, so its undo can put it all back.
  const beforeAiRef = useRef<{ title: string; snippet: string; category: ApiItem['category']; tags: string[] } | null>(null);
  const [editError, setEditError] = useState('');
  const [organizing, setOrganizing] = useState(item.classification_status === 'pending');
  // Still waiting in 미분류함 (never organized): ✦ is its first organize,
  // not a re-organize -- nothing to undo back to.
  const [waiting, setWaiting] = useState(item.classification_status === 'unclassified');
  // This month's AI organizes left: for ✦'s bubble and, while the item waits,
  // for whether it waits because the quota ran out (0) or the AI failed on it.
  const [classifyLeft, setClassifyLeft] = useState<number | null>(null);
  const [aiAgreed, setAiAgreed] = useState(false);
  const [askReorganize, setAskReorganize] = useState(false);
  const [waitReason, setWaitReason] = useState(item.unclassified_reason ?? null);
  // A composed memo's sources, loaded when "원본 N개" is opened (decision Q7).
  const sourceIds = item.composed_from ?? [];
  const isComposed = sourceIds.length > 0 || !!composedFrom;
  // The "made from" line with its 다른 모양으로 다시: right after making it
  // (composedFrom, maybe a free remake), and also when the memo is opened
  // again later -- from its stored sources and the tag it's filed under
  // (decision C2; that remake costs 1, the sheet says so).
  // The server files a composed memo's tag among the AI tags; a tag the
  // person added later (userTags) isn't what it was made from.
  const reopenTag = aiTags[0] ?? userTags[0];
  const composeInfo: { tag: string; count: number; freeRemake?: boolean } | null =
    composedFrom ?? (sourceIds.length > 0 && reopenTag ? { tag: reopenTag, count: sourceIds.length } : null);
  const [editingBody, setEditingBody] = useState(false);
  const [sources, setSources] = useState<ApiItem[] | null>(null);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const toggleSources = () => setSourcesOpen((open) => !open);
  // Loaded up front: the memo's [#N] links and the "not in the memo" list
  // need them.
  useEffect(() => {
    if (sourceIds.length === 0) return;
    let cancelled = false;
    fetchComposeSources(item.id)
      .then((res) => {
        if (!cancelled) setSources(res.items);
      })
      .catch(() => {
        if (!cancelled) setSources([]);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);
  // [#N] is the Nth item it was made from (compose order = composed_from).
  const sourceAt = (n: number) => sources?.find((src) => src.id === sourceIds[n - 1]) ?? null;
  const openSource = (n: number) => {
    const src = sourceAt(n);
    if (src) navigation.push('ItemDetail', { item: src });
    // Loaded, but not among them: trashed (or gone) -- say so, not nothing.
    else if (sources) showToast(S.sourceMissing);
  };
  // Where the memo body starts in the scroll view, and each ref's line in
  // it -- tapping a linked source in the list scrolls the memo there.
  const bodyY = useRef(0);
  const refY = useRef(new Map<number, number>());

  const [deleteState, setDeleteState] = useState<DeleteState>('idle');
  // Memo lock: a locked memo opens behind the device PIN / fingerprint.
  const [locked, setLocked] = useState(!!item.locked);
  // Reached from an opened locked tag: no second PIN.
  const [opened, setOpened] = useState(!item.locked || (!!item.locked_by_tag && tagsOpen()));
  const [lockError, setLockError] = useState('');
  const openLocked = async () => {
    if (await askPin('check', { prompt: S.bioPrompt, cancel: COMMON.cancel })) setOpened(true);
  };
  useEffect(() => {
    if (!opened) openLocked();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const toggleLock = async () => {
    setLockError('');
    const next = !locked;
    if (next && !(await hasPin()) && !(await askPin('set'))) return;
    setLocked(next);
    try {
      await setItemLocked(item.id, next);
      if (next) forgetWeekly().catch(() => {});
    } catch (err) {
      setLocked(!next);
      setLockError(S.lockFailed(friendlyError(err)));
    }
  };

  // "AI 결과 신고" (Play's AI-generated content policy): flag the AI output.
  const [reportState, setReportState] = useState<'idle' | 'confirming' | 'sending' | 'done'>('idle');
  const [reportError, setReportError] = useState('');
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
          setWaiting(fresh.classification_status === 'unclassified');
          setWaitReason(fresh.unclassified_reason ?? null);
          savedRef.current = { ...savedRef.current, title: fresh.title ?? '', snippet: fresh.snippet ?? '', rawText: fresh.raw_text ?? '' };
          setTitle(fresh.title ?? '');
          setSnippet(fresh.snippet ?? '');
          setRawText(fresh.raw_text ?? '');
          setCategory(fresh.category);
          setAiTags(fresh.tags);
          setUserTags(fresh.user_tags);
          if (fresh.classification_status === 'unclassified') {
            // Where the AI memo shows, its waiting line says this already --
            // one reason on screen, not two that disagree.
            if (item.capture_type === 'text' || fresh.snippet) setEditError(S.organizeFailed);
            return;
          }
          // No snapshot = this was the item's first organize (opened while
          // still 분석 중), not a ✦ re-organize: nothing to undo or recount.
          const before = beforeAiRef.current;
          if (!before) {
            showSnack(item.capture_type === 'text' ? S.taggedText : S.taggedFull, null);
            return;
          }
          const what = item.capture_type === 'text' ? S.reorganizedText : S.reorganizedFull;
          showSnack(what, () => undoAi(before));
        })
        .catch(() => {});
    }, REORGANIZE_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [organizing, item.id]);

  useEffect(() => {
    if (organizing) return;
    let cancelled = false;
    fetchPlan()
      .then((p) => {
        if (cancelled) return;
        setClassifyLeft(usesLeft(p, 'classify') ?? 0);
        setAiAgreed(p.aiConsent === 'agreed');
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [waiting, organizing]);

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

  // Just remade by 다른 모양으로 다시: one tap puts the old title/body back.
  useEffect(() => {
    if (!remadeFrom) return;
    showSnack(S.remade, () => {
      hideSnack();
      const now = { title: savedRef.current.title, rawText: savedRef.current.rawText };
      savedRef.current.title = remadeFrom.title;
      savedRef.current.rawText = remadeFrom.rawText;
      setTitle(remadeFrom.title);
      setRawText(remadeFrom.rawText);
      updateItem(item.id, { title: remadeFrom.title, rawText: remadeFrom.rawText }).catch((err) => {
        savedRef.current.title = now.title;
        savedRef.current.rawText = now.rawText;
        setTitle(now.title);
        setRawText(now.rawText);
        setEditError(friendlyError(err));
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    handEdited.current = true;
    save(field, next, (previous) =>
      showSnack(S.edited[field], () => {
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
    <VoiceInputButton
      theme={theme}
      size={16}
      onStart={() => {
        const current = valueOf(field);
        voiceBaseRef.current = current.trim() ? `${current.trimEnd()} ` : '';
      }}
      onResult={(spoken, isFinal) => {
        const text = (voiceBaseRef.current + spoken).slice(0, FIELD_MAX[field]);
        setterOf(field)(text);
        if (isFinal) commit(field, text);
      }}
    />
  );

  // A TextInput dressed exactly like the text it replaces -- tapping just
  // puts the cursor in, nothing on screen changes shape.
  const inlineInput = (field: EditField, textStyle: object, placeholder: string) => {
    const input = (
      <TextInput
        value={valueOf(field)}
        onChangeText={setterOf(field)}
        maxLength={FIELD_MAX[field]}
        onBlur={() => {
          commit(field);
          if (field === 'rawText') setEditingBody(false);
        }}
        autoFocus={field === 'rawText' && editingBody}
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
      // An undo would put back the empty '정리 대기' placeholders (and the
      // organize was still spent) -- so a first organize keeps no snapshot.
      beforeAiRef.current = waiting ? null : { title: savedRef.current.title, snippet: savedRef.current.snippet, category, tags: aiTags };
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
  // The × removes the chip at once, so a few seconds to undo (UX-94).
  const removeTag = (tag: string) => {
    setUserTags((current) => current.filter((t) => t !== tag));
    setTagError('');
    removeTagApi(item.id, tag)
      .then(() => showSnack(S.tagRemoved(tag), () => undoRemoveTag(tag)))
      .catch((err) => {
        setUserTags((current) => [...current, tag]);
        setTagError(friendlyError(err));
      });
  };

  const undoRemoveTag = (tag: string) => {
    hideSnack();
    setUserTags((current) => (current.includes(tag) ? current : [...current, tag]));
    addTag(item.id, tag).catch((err) => {
      setUserTags((current) => current.filter((t) => t !== tag));
      setTagError(friendlyError(err));
    });
  };

  const removeAiTag = (tag: string) => {
    const before = aiTags;
    setAiTags((current) => current.filter((t) => t !== tag));
    setTagError('');
    removeAiTagApi(item.id, tag)
      .then(() => showSnack(S.tagRemoved(tag), () => undoRemoveAiTag(before)))
      .catch((err) => {
        setAiTags((current) => [...current, tag]);
        setTagError(friendlyError(err));
      });
  };

  // Put back as an AI tag (the same path as undoAi) -- adding it again by
  // hand would make it '내 태그'.
  const undoRemoveAiTag = (before: string[]) => {
    hideSnack();
    // Read from state, not this render's aiTags -- the snack's closure is older.
    let now: string[] = [];
    setAiTags((current) => {
      now = current;
      return before;
    });
    updateItem(item.id, { tags: before }).catch((err) => {
      setAiTags(now);
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

  // Replacing what's there says so first. Nothing to replace yet (a first
  // organize), or a press the server turns into the consent sheet or Pro,
  // goes straight on.
  const pressSparkle = () => {
    if (waiting || organizing || !aiAgreed || classifyLeft === 0) reorganize();
    else setAskReorganize(true);
  };
  const sparkleButton = (
    <View style={styles.sparkleRow}>
      {/* A text memo has no AI memo line to say this. */}
      {organizing && item.capture_type === 'text' && <Text style={[styles.sparkleWorking, { color: theme.sub }]}>{S.organizing}</Text>}
      {/* Every press spends one, so while it can be pressed (like sentence search). */}
      {aiAgreed && !organizing && classifyLeft !== null && <Bubble theme={theme} label={USES.left(classifyLeft)} tail="right" style={styles.sparkleBubble} />}
      <IconButton theme={theme} on="sheet" onPress={pressSparkle} label={S.reorganize}>
        {organizing ? <ActivityIndicator size="small" color={theme.accent} /> : <SparkleIcon size={15} color={theme.accent} strokeWidth={1.4} />}
      </IconButton>
    </View>
  );

  // The system share sheet (카톡, 메시지, 복사 ...) with what's on screen:
  // the title and the body -- for a photo/link, its AI memo, 내 메모 and the
  // link. Built-in Share, no extra library.
  const share = () => {
    const body =
      item.capture_type === 'text'
        ? isComposed
          ? plainMemo(rawText) // no ## / ** / [#3] in the other app
          : rawText
        : [snippet, userNote ? S.myNoteShare(userNote) : null, item.raw_url].filter(Boolean).join('\n\n');
    const message = [title.trim(), body.trim()].filter(Boolean).join('\n\n');
    if (!message) return;
    Share.share({ message }).catch(() => {});
  };

  const confirmReport = async () => {
    setReportState('sending');
    setReportError('');
    try {
      await reportAiOutput(item.id);
      setReportState('done');
    } catch (err) {
      setReportError(friendlyError(err));
      setReportState('confirming');
    }
  };

  const confirmDelete = async () => {
    setDeleteState('deleting');
    try {
      await deleteItem(item.id);
      forgetWeekly().catch(() => {});
      close();
    } catch (err) {
      setDeleteError(friendlyError(err));
      setDeleteState('confirming');
    }
  };

  if (!opened) {
    return (
      <ModalSheet theme={theme} onClose={close} paddingBottom={24} paddingHorizontal={20}>
        <View style={styles.lockedGate}>
          <LockIcon size={22} color={theme.sub} strokeWidth={1.4} />
          <Heading theme={theme} size={SHEET_TITLE_SIZE} style={styles.lockedTitle}>
            {itemTitle(item)}
          </Heading>
          <Text style={[styles.composedText, { color: theme.sub, textAlign: 'center' }]}>{S.lockedBody}</Text>
        </View>
        <ButtonRow theme={theme} style={{ marginTop: 18 }}>
          <GhostButton label={COMMON.cancel} theme={theme} onPress={close} />
          <SolidButton label={S.open} theme={theme} onPress={openLocked} />
        </ButtonRow>
      </ModalSheet>
    );
  }

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
            {/* Categories left the UI (tags do that job); the spacer keeps
                the header actions on the right. */}
            <View />
            <View style={styles.headerActions}>
              {/* Rewrite the title/memo/tags with the person's own words as the
                  guide (see pipeline.ts hintFor). Same ✦ as sentence search. */}
              {/* On a fresh 모아서 만들기 result the header ✦ ("re-tag", 1 AI
                  organize) read as "make it again" -- that's the 다른 형식으로
                  link under the title instead. */}
              {item.capture_type === 'text' && !isComposed && !locked && sparkleButton}
              {LOCK_SUPPORTED && (
                <IconButton theme={theme} on="sheet" onPress={toggleLock} label={locked ? S.unlock : S.lock}>
                  <LockIcon size={14} color={locked ? theme.ink : theme.sub} strokeWidth={1.3} open={!locked} />
                </IconButton>
              )}
              <IconButton theme={theme} on="sheet" onPress={share} label={S.share}>
                <ShareIcon size={14} color={theme.sub} strokeWidth={1.3} />
              </IconButton>
              <IconButton theme={theme} on="sheet" onPress={() => setDeleteState('confirming')} label={S.moveToTrash}>
                <TrashIcon size={14} color={theme.sub} strokeWidth={1.3} />
              </IconButton>
              {/* Last, in the corner: reporting AI output is rare and shouldn't
                  sit among the everyday actions. */}
              {(item.classification_status === 'done' || isComposed) && (
                <IconButton theme={theme} on="sheet" onPress={() => setReportState('confirming')} label={S.report}>
                  <ReportIcon size={14} color={theme.danger} strokeWidth={1.3} />
                </IconButton>
              )}
            </View>
          </View>

          {askReorganize && (
            <ConfirmPopup
              theme={theme}
              title={S.reorganize}
              body={item.capture_type === 'text' ? S.reorganizeTextBody : S.reorganizeFullBody}
              onNo={() => setAskReorganize(false)}
              onYes={() => {
                setAskReorganize(false);
                reorganize();
              }}
            />
          )}

          {composeInfo && (
            <View style={styles.composedNote}>
              <SparkleIcon size={13} color={theme.accent} strokeWidth={1.5} />
              <Text style={[styles.composedText, { color: theme.sub }]}>
                {S.composedFrom(composeInfo.tag, composeInfo.count)}
              </Text>
              <Pressable
                onPress={() =>
                  navigation.replace('Compose', {
                    tag: composeInfo.tag,
                    // What a remake can still use: sources since trashed or
                    // locked are out (server rule). Unknown until loaded.
                    ...(sources && sources.length > 0
                      ? { count: composeMaterials(sources).usable.length, lockedOut: composeMaterials(sources).locked }
                      : { count: composeInfo.count }),
                    retryOf: item.id,
                    freeRemake: composeInfo.freeRemake,
                    remakeBefore: { title: savedRef.current.title, rawText: savedRef.current.rawText, edited: handEdited.current },
                  })
                }
                hitSlop={8}
                style={styles.composedAgain}
              >
                <Text style={[styles.composedText, { color: theme.ink, textDecorationLine: 'underline' }]}>{composeInfo.freeRemake ? S.otherShapeFree : S.otherShape}</Text>
              </Pressable>
            </View>
          )}

          {lockError !== '' && <Text style={[styles.composedText, { color: theme.danger, marginBottom: 12 }]}>{lockError}</Text>}
          {(reportState === 'confirming' || reportState === 'sending') && (
            <ConfirmCard
              theme={theme}
              title={S.reportTitle}
              body={S.reportBody}
              confirmLabel={S.reportSend}
              busy={reportState === 'sending'}
              error={reportError ? S.reportFailed(reportError) : undefined}
              onCancel={() => setReportState('idle')}
              onConfirm={confirmReport}
            />
          )}
          {reportState === 'done' && <Text style={[styles.composedText, { color: theme.sub, marginBottom: 12 }]}>{S.reported}</Text>}

          {deleteState !== 'idle' && (
            <ConfirmCard
              theme={theme}
              title={S.trashTitle}
              body={S.trashBody}
              confirmLabel={COMMON.delete}
              busy={deleteState === 'deleting'}
              error={deleteError ? S.deleteFailed(deleteError) : undefined}
              onCancel={() => setDeleteState('idle')}
              onConfirm={confirmDelete}
            />
          )}

          <View style={styles.editRow}>
            <View style={styles.flex1}>
              {inlineInput('title', headingStyle, organizing ? S.organizing : rawText.slice(0, 40) || S.noTitle)}
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
                  maxLength={30}
                  autoFocus
                  onFocus={() => scrollRef.current?.scrollTo({ y: 0, animated: true })}
                  onSubmitEditing={submitNewTag}
                  onBlur={submitNewTag}
                  placeholder={S.newTag}
                  placeholderTextColor={theme.sub}
                  style={{ color: theme.ink, fontFamily: BODY_KR, fontSize: 13, padding: 0, minWidth: 60, outlineWidth: 0 }}
                />
              </View>
            ) : (
              <TagAddChip label={S.addTag} theme={theme} onPress={openTagInput} />
            )}
          </ScrollView>
          {tagError !== '' && <Text style={[styles.errorText, { color: theme.danger }]}>{S.tagSaveFailed}{tagError}</Text>}
          {/* Another way into 모아서 만들기 (decision Q8): gather what shares
              this item's tags. Not on a composed memo itself. */}
          {aiTags.length + userTags.length > 0 && sourceIds.length === 0 && !composedFrom && (
            <Pressable
              onPress={() => {
                const all = [...userTags, ...aiTags.filter((t) => !userTags.includes(t))];
                navigation.navigate('Compose', { tag: all[0], tagChoices: all });
              }}
              hitSlop={6}
              style={styles.composeEntry}
            >
              <SparkleIcon size={12} color={theme.accent} strokeWidth={1.5} />
              <Text style={[styles.composedText, { color: theme.accent }]}>{S.composeFromTag}</Text>
            </Pressable>
          )}

          {item.capture_type === 'screenshot' && (
            <View style={[styles.imageBox, { backgroundColor: theme.soft, borderColor: theme.line }]}>
              {imageError ? (
                <Text style={{ color: theme.sub, fontFamily: BODY_KR, padding: 24 }}>
                  {S.imageFailed}
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
                <Text style={[styles.aiMemoLabel, { color: theme.sub }]}>{S.aiMemo}</Text>
                {sparkleButton}
              </View>
              {/* Empty/working state in sub italic -- theme.line was ~1.1-1.3:1, unreadable. */}
              <Text style={[styles.body, styles.aiMemoText, { color: theme.sub, fontStyle: snippet ? 'normal' : 'italic' }]}>
                {snippet ||
                  (organizing
                    ? S.organizing
                    : waiting
                      ? waitReason === 'consent'
                        ? S.waitConsent
                        : waitReason === 'failed'
                        ? S.waitFailed
                        : classifyLeft === 0
                          ? S.waitQuotaOut
                          : waitReason === 'quota'
                            ? S.waitQuota
                            : S.waitOther
                      : S.noAiMemo)}
              </Text>
            </View>
          )}

          {/* The person's own words -- kept visually distinct (italic,
              accent) from the AI memo above, since it isn't generated. */}
          {item.capture_type !== 'text' && (
            // Dressed as a field (like 태그 검색), so it reads as a place to type.
            <FieldRow theme={theme} style={styles.fieldRow} mic={voiceButton('userNote')}>
              {/* The person's own words: ink (accent is reserved for AI/status). */}
              {inlineInput('userNote', [styles.body, styles.inField, { color: theme.ink, fontStyle: 'italic' }], S.myNotePlaceholder)}
            </FieldRow>
          )}

          {item.capture_type === 'text' &&
            (isComposed && !editingBody ? (
              // A 모아서 만들기 memo reads in sections; tap to edit the text.
              <Pressable
                onPress={() => setEditingBody(true)}
                accessibilityHint={S.tapToEdit}
                onLayout={(e) => {
                  bodyY.current = e.nativeEvent.layout.y;
                }}
              >
                <MemoText
                  text={rawText}
                  theme={theme}
                  style={{ ...(StyleSheet.flatten(styles.body) as TextStyle), color: theme.ink }}
                  onRef={openSource}
                  onRefLayout={(n, y) => {
                    if (!refY.current.has(n)) refY.current.set(n, y);
                  }}
                />
              </Pressable>
            ) : (
              <FieldRow theme={theme} style={styles.fieldRow} mic={voiceButton('rawText')}>
                {inlineInput('rawText', [styles.body, styles.inField, { color: theme.ink }], S.bodyPlaceholder)}
              </FieldRow>
            ))}

          {editError !== '' && <Text style={[styles.errorText, { color: theme.danger }]}>{editError}</Text>}


          {item.raw_url && (
            <Pressable onPress={() => Linking.openURL(item.raw_url!)} style={styles.linkRow}>
              <Text style={{ color: theme.accent, fontFamily: BODY_KR_MEDIUM, fontSize: 13.5 }} numberOfLines={1}>
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
          {/* What it was made from: the ones the memo doesn't mention are
              listed outright; the full list opens below. A source the memo
              links to scrolls the memo to that line; any other opens it. */}
          {sourceIds.length > 0 && sources !== null && (() => {
            const mentioned = refsIn(rawText);
            const order = sourceIds.map((id, idx) => ({ n: idx + 1, src: sources.find((x) => x.id === id) ?? null }));
            const unmentioned = order.filter((o) => o.src && !mentioned.has(o.n));
            const tapSource = (n: number) => {
              const y = refY.current.get(n);
              if (mentioned.has(n) && y !== undefined && !editingBody) scrollRef.current?.scrollTo({ y: Math.max(0, bodyY.current + y - 24), animated: true });
              else openSource(n);
            };
            return (
              <View style={styles.sourcesBox}>
                {unmentioned.length > 0 && mentioned.size > 0 && (
                  <>
                    <Text style={[styles.composedText, { color: theme.sub }]}>{S.notInMemo(unmentioned.length)}</Text>
                    {unmentioned.map((o) => (
                      <Pressable key={o.n} onPress={() => openSource(o.n)} hitSlop={4}>
                        <Text style={[styles.composedText, { color: theme.ink }]} numberOfLines={1}>
                          {`· ${itemTitle(o.src!)}`}
                        </Text>
                      </Pressable>
                    ))}
                  </>
                )}
                <Pressable onPress={toggleSources} hitSlop={6} style={{ marginTop: 6 }}>
                  <Text style={[styles.composedText, { color: theme.ink, textDecorationLine: 'underline' }]}>
                    {sourcesOpen ? S.hideSources : S.showSources(sourceIds.length)}
                  </Text>
                </Pressable>
                {sourcesOpen && (
                  <>
                    {order
                      .filter((o) => o.src)
                      .map((o) => (
                        <Pressable key={o.n} onPress={() => tapSource(o.n)} hitSlop={4}>
                          <Text style={[styles.composedText, { color: theme.ink }]} numberOfLines={1}>
                            {`· ${itemTitle(o.src!)}${mentioned.has(o.n) ? '  ↑' : ''}`}
                          </Text>
                        </Pressable>
                      ))}
                    {sources.length < sourceIds.length && (
                      <Text style={[styles.composedText, { color: theme.sub }]}>{S.sourcesDeleted(sourceIds.length - sources.length)}</Text>
                    )}
                  </>
                )}
              </View>
            );
          })()}

          <View style={styles.footerMeta}>
            <SourceIcon source={item.source} size={11} color={theme.sub} strokeWidth={1.3} />
            <Text style={[styles.timestamp, styles.footerMetaText, { color: theme.sub }]}>
              {channelMetaLabel} · {S.saved(relativeTime(item.shared_at))}
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
                <Text style={[styles.snackAction, { color: theme.bg }]}>{S.undo}</Text>
              </Pressable>
            )}
          </View>
        )}

        <ButtonRow theme={theme} style={styles.buttonRow}>
          {item.raw_url ? (
            <>
              <GhostButton label={COMMON.close} theme={theme} onPress={close} />
              <SolidButton label={S.openLink} theme={theme} onPress={() => Linking.openURL(item.raw_url!)} />
            </>
          ) : (
            <SolidButton label={COMMON.close} theme={theme} onPress={close} />
          )}
        </ButtonRow>
    </ModalSheet>
    <ImageViewer uri={viewerUri} onClose={() => setViewerUri(null)} />
    </>
  );
}

const styles = StyleSheet.create({
  sparkleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  sparkleBubble: { alignSelf: 'center' },
  sparkleWorking: { flexShrink: 1, fontFamily: BODY_KR, fontSize: 12.5 },
  lockedGate: { alignItems: 'center', gap: 10, paddingTop: 8 },
  lockedTitle: { textAlign: 'center' },
  sourcesBox: { gap: 6, marginTop: 8 },
  composeEntry: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 8 },
  flexShrink: { flexShrink: 1 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerActions: { flexDirection: 'row', gap: 8 },
  imageBox: { marginTop: 16, borderRadius: 14, borderWidth: 1, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  image: { width: '100%', aspectRatio: 1 },
  body: { fontSize: 14.5, lineHeight: 22.5, marginTop: 14, fontFamily: BODY_KR },
  linkRow: { marginTop: 14 },
  inline: { padding: 0, paddingTop: 0, paddingBottom: 0, borderWidth: 0, textAlignVertical: 'top', outlineWidth: 0 } as object,
  inlineMirror: { opacity: 0 },
  // Placed under the mirror's top margin (top is set per field).
  inlineWebFill: { position: 'absolute', left: 0, right: 0, bottom: 0, marginTop: 0, overflow: 'hidden' } as object,
  editRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  fieldRow: { marginTop: 14 },
  inField: { marginTop: 0, lineHeight: 22, includeFontPadding: false },
  flex1: { flex: 1 },
  aiMemo: { marginTop: 16 },
  composedNote: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  composedAgain: { marginLeft: 'auto' },
  composedText: { fontSize: 12.5, fontFamily: BODY_KR },
  aiMemoHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  aiMemoLabel: { fontFamily: MONO, fontSize: 10.5, letterSpacing: 1.2 },
  aiMemoText: { marginTop: 6 },
  snack: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 11, marginTop: 12 },
  snackText: { flex: 1, fontSize: 13, lineHeight: 18, fontFamily: BODY_KR },
  snackAction: { fontSize: 13, fontFamily: BODY_KR_MEDIUM, textDecorationLine: 'underline' },
  tagScroll: { marginTop: 16, flexGrow: 0 },
  // paddingVertical: same Android horizontal-ScrollView bottom-edge clip as
  // Home's tab strip -- outlined tag chips lost their bottom border.
  tagRow: { flexDirection: 'row', gap: 8, alignItems: 'center', paddingRight: 8, paddingVertical: 2 },
  newTagBox: { borderWidth: 1, borderStyle: 'dashed', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 },
  errorText: { fontSize: 12.5, marginTop: 8, fontFamily: BODY_KR },
  timestamp: { fontSize: 12.5, marginTop: 18, marginBottom: 4, fontFamily: BODY_KR },
  footerMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  footerMetaText: { marginTop: 0 },
  buttonRow: { marginTop: 16 },
});
