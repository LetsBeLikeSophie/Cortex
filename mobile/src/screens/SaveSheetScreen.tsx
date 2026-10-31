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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SAVE_DRAFT_KEY } from '../auth/accountTraces';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useTheme } from '../theme/ThemeContext';
import { MONO, OUTLINE, allEdges, conceptOf, emToTracking, BODY_KR, BODY_KR_MEDIUM } from '../theme/themes';
import { Card, frameStyle, isBoxed } from '../components/Card';
import { copyFor } from '../data/content';
import { newRequestId, saveTextItem, saveLinkItem, saveScreenshotItem, addTag, fetchPlan, ApiItem, ItemSource, Plan, friendlyError } from '../api/client';
import { itemTitle, sourceLabel, captureTypeLabel } from '../api/format';
import { CheckIcon } from '../components/Icons';
import { TagChip, TagAddChip } from '../components/Chips';
import { Heading } from '../components/Typography';
import { ModalSheet } from '../components/ModalSheet';
import { Bubble, isLowOnUses } from '../components/Bubble';
import { ButtonRow, GhostButton, SolidButton } from '../components/Buttons';
import { VoiceInputButton } from '../components/VoiceInputButton';
import { permissionToast, showToast } from '../native/toast';
import { fieldStyle, pickStyle, pickTextStyle } from '../components/Fields';
import { splitLinkText } from '../data/linkText';
import type { RecentScreenshot } from '../data/photoBatch';
import type { RootStackParamList } from '../navigation/types';
import { strings } from '../i18n';
import { COMMON, USES, categoryLabel } from '../i18n/common';

const S = strings({
  ko: {
    camera: '카메라',
    draftKept: "적던 글은 '+'에 남겨 뒀어요",
    allFailed: '전부 저장하지 못했어요',
    quotaNoConsent: 'AI 동의 전 · 미분류함으로',
    quotaOver: (n: number) => `${n}장은 미분류함으로`,
    quotaUsedUp: 'AI 정리 다 씀 · 미분류함으로',
    heading: '무엇을 저장할까요?',
    intro: '붙여넣거나 사진을 골라 저장해요',
    repickPhoto: '사진 지우고 다시 선택',
    clearLink: '지우고 직접 입력',
    memoBulkPlaceholder: '사진들에 같이 남길 메모 (선택)',
    memoPlaceholder: '예: 성수동에 새로 생긴 크로플 맛집 완전 대박이래',
    draftWaiting: '적던 글 있음 · ',
    draftLoad: '눌러서 불러오기',
    pickAlbum: '앨범에서 선택',
    takePhoto: '카메라로 촬영',
    selectedCount: (n: number) => `${n}장 선택됨`,
    clearSelection: '선택 취소',
    savingProgress: (done: number, total: number) => `${done}/${total}장 저장 중...`,
    notePlaceholder: '왜 저장했는지 한 줄 (선택)',
    saveFailed: (e: string) => `저장 실패: ${e}`,
    saveN: (n: number) => `${n}장 저장하기`,
    save: '저장하기',
    savedN: (n: number) => `${n}개 저장했어요`,
    failedN: (n: number) => `${n}개는 저장하지 못했어요.`,
    unclassifiedConsentN: (n: number) => `${n}개는 AI 분석 동의 전이라 미분류함에 넣어뒀어요`,
    unclassifiedQuotaN: (n: number) => `${n}개는 이번 달 AI 정리를 다 써서 미분류함에 넣어뒀어요`,
    aiConsent: 'AI 분석 동의',
    proNow: 'Pro로 바로 정리',
    findLater: '단어 하나만 적으면 다시 꺼내 드려요.',
    analyzingTags: '제목·태그를 분석하고 있어요',
    unclassifiedConsent: 'AI 분석 동의 전이라 미분류함에 넣어뒀어요',
    unclassifiedQuota: '이번 달 AI 정리를 다 써서 미분류함에 넣어뒀어요',
    open: '열어 보기',
  },
  en: {
    camera: 'Camera',
    draftKept: "Your text is kept under '+'",
    allFailed: "Couldn't save any of them",
    quotaNoConsent: 'No AI consent · to Unsorted',
    quotaOver: (n: number) => `${n} to Unsorted`,
    quotaUsedUp: 'AI sorts used up · to Unsorted',
    heading: 'What do you want to save?',
    intro: 'Paste text or pick a photo',
    repickPhoto: 'Remove photo and pick again',
    clearLink: 'Clear and type instead',
    memoBulkPlaceholder: 'A note for these photos (optional)',
    memoPlaceholder: 'e.g. That new croffle place in Seongsu is amazing',
    draftWaiting: 'Unfinished note · ',
    draftLoad: 'tap to bring it back',
    pickAlbum: 'Pick from album',
    takePhoto: 'Take a photo',
    selectedCount: (n: number) => `${n} selected`,
    clearSelection: 'Clear',
    savingProgress: (done: number, total: number) => `Saving ${done}/${total}...`,
    notePlaceholder: 'Why you saved it (optional)',
    saveFailed: (e: string) => `Couldn't save: ${e}`,
    saveN: (n: number) => `Save ${n}`,
    save: 'Save',
    savedN: (n: number) => `Saved ${n}`,
    failedN: (n: number) => `${n} couldn't be saved.`,
    unclassifiedConsentN: (n: number) => `${n} went to Unsorted (no AI consent yet)`,
    unclassifiedQuotaN: (n: number) => `${n} went to Unsorted (AI sorting used up this month)`,
    aiConsent: 'Allow AI',
    proNow: 'Sort now with Pro',
    findLater: 'Just type one word to bring it back.',
    analyzingTags: 'Working out title and tags',
    unclassifiedConsent: 'Put in Unsorted (no AI consent yet)',
    unclassifiedQuota: "Put in Unsorted (this month's AI sorting is used up)",
    open: 'Open',
  },
  ja: {
    camera: 'カメラ',
    draftKept: "書きかけの文は「+」に残しました",
    allFailed: 'どれも保存できませんでした',
    quotaNoConsent: 'AI未同意 · 未分類へ',
    quotaOver: (n: number) => `${n}枚は未分類へ`,
    quotaUsedUp: 'AI整理切れ · 未分類へ',
    heading: '何を保存しますか?',
    intro: '貼り付けるか写真を選んで保存',
    repickPhoto: '写真を消して選び直す',
    clearLink: '消して直接入力',
    memoBulkPlaceholder: '写真に付けるメモ(任意)',
    memoPlaceholder: '例: 聖水にできたクロッフルの店、すごく美味しいらしい',
    draftWaiting: '書きかけのメモあり · ',
    draftLoad: 'タップで呼び出す',
    pickAlbum: 'アルバムから選ぶ',
    takePhoto: 'カメラで撮る',
    selectedCount: (n: number) => `${n}枚選択中`,
    clearSelection: '選択解除',
    savingProgress: (done: number, total: number) => `${done}/${total}枚 保存中...`,
    notePlaceholder: '保存した理由をひとこと(任意)',
    saveFailed: (e: string) => `保存できませんでした: ${e}`,
    saveN: (n: number) => `${n}枚を保存`,
    save: '保存する',
    savedN: (n: number) => `${n}件保存しました`,
    failedN: (n: number) => `${n}件は保存できませんでした。`,
    unclassifiedConsentN: (n: number) => `${n}件はAI分析に未同意のため未分類に入れました`,
    unclassifiedQuotaN: (n: number) => `${n}件は今月のAI整理を使い切ったため未分類に入れました`,
    aiConsent: 'AI分析に同意',
    proNow: 'Proですぐ整理',
    findLater: '単語ひとつで、また呼び出せます。',
    analyzingTags: 'タイトルとタグを分析中です',
    unclassifiedConsent: 'AI分析に未同意のため未分類に入れました',
    unclassifiedQuota: '今月のAI整理を使い切ったため未分類に入れました',
    open: '開く',
  },
  'zh-Hans': {
    camera: '相机',
    draftKept: '正在写的文字已保留在「+」里',
    allFailed: '全部保存失败',
    quotaNoConsent: '未同意 AI · 放入未分类',
    quotaOver: (n: number) => `${n} 张放入未分类`,
    quotaUsedUp: 'AI 整理已用完 · 放入未分类',
    heading: '要保存什么？',
    intro: '粘贴文字或选张照片来保存',
    repickPhoto: '删除照片并重选',
    clearLink: '清除并手动输入',
    memoBulkPlaceholder: '给这些照片加备注（可选）',
    memoPlaceholder: '例：圣水洞新开的可颂华夫店超好吃',
    draftWaiting: '有未写完的内容 · ',
    draftLoad: '点按恢复',
    pickAlbum: '从相册选择',
    takePhoto: '拍照',
    selectedCount: (n: number) => `已选 ${n} 张`,
    clearSelection: '取消选择',
    savingProgress: (done: number, total: number) => `正在保存 ${done}/${total} 张...`,
    notePlaceholder: '为什么保存（可选）',
    saveFailed: (e: string) => `保存失败：${e}`,
    saveN: (n: number) => `保存 ${n} 张`,
    save: '保存',
    savedN: (n: number) => `已保存 ${n} 项`,
    failedN: (n: number) => `${n} 项保存失败。`,
    unclassifiedConsentN: (n: number) => `${n} 项因尚未同意 AI 分析，已放入未分类`,
    unclassifiedQuotaN: (n: number) => `${n} 项因本月 AI 整理已用完，已放入未分类`,
    aiConsent: '同意 AI 分析',
    proNow: '用 Pro 立即整理',
    findLater: '只需输入一个词，就能再找回来。',
    analyzingTags: '正在分析标题和标签',
    unclassifiedConsent: '尚未同意 AI 分析，已放入未分类',
    unclassifiedQuota: '本月 AI 整理已用完，已放入未分类',
    open: '打开',
  },
  'zh-Hant': {
    camera: '相機',
    draftKept: '正在寫的文字已保留在「+」裡',
    allFailed: '全部儲存失敗',
    quotaNoConsent: '未同意 AI · 放入未分類',
    quotaOver: (n: number) => `${n} 張放入未分類`,
    quotaUsedUp: 'AI 整理已用完 · 放入未分類',
    heading: '要儲存什麼？',
    intro: '貼上文字或選張照片來儲存',
    repickPhoto: '刪除照片並重選',
    clearLink: '清除並手動輸入',
    memoBulkPlaceholder: '為這些照片加備註（選填）',
    memoPlaceholder: '例：聖水洞新開的可頌鬆餅店超好吃',
    draftWaiting: '有未寫完的內容 · ',
    draftLoad: '點按恢復',
    pickAlbum: '從相簿選擇',
    takePhoto: '拍照',
    selectedCount: (n: number) => `已選 ${n} 張`,
    clearSelection: '取消選擇',
    savingProgress: (done: number, total: number) => `正在儲存 ${done}/${total} 張...`,
    notePlaceholder: '為什麼儲存（選填）',
    saveFailed: (e: string) => `儲存失敗：${e}`,
    saveN: (n: number) => `儲存 ${n} 張`,
    save: '儲存',
    savedN: (n: number) => `已儲存 ${n} 項`,
    failedN: (n: number) => `${n} 項儲存失敗。`,
    unclassifiedConsentN: (n: number) => `${n} 項因尚未同意 AI 分析，已放入未分類`,
    unclassifiedQuotaN: (n: number) => `${n} 項因本月 AI 整理已用完，已放入未分類`,
    aiConsent: '同意 AI 分析',
    proNow: '用 Pro 立即整理',
    findLater: '只要輸入一個詞，就能再找回來。',
    analyzingTags: '正在分析標題和標籤',
    unclassifiedConsent: '尚未同意 AI 分析，已放入未分類',
    unclassifiedQuota: '本月 AI 整理已用完，已放入未分類',
    open: '打開',
  },
});

// Android's OS share sheet lands here now (expo-share-intent, see
// HomeScreen's handler) with sharedText/sharedUrl/sharedImageUri route
// params -- pre-filling below instead of requiring anyone to paste
// anything. Typing/pasting/picking manually still works the same way for
// everything else (and for iOS, which has no share extension yet).
type Status = 'input' | 'saving' | 'done' | 'error';

const DRAFT_KEY = SAVE_DRAFT_KEY;
// The server's limit for a save's note (IncomingItemSchema).
const NOTE_MAX = 1000;

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
  // Layer fills its marks instead of outlining them (no borders there).
  const filledMark = conceptOf(theme) === 'layer';
  const txt = copyFor();

  const [text, setText] = useState(route.params?.sharedText ?? '');
  const [linkUrl, setLinkUrl] = useState(route.params?.sharedUrl ?? null);
  const [image, setImage] = useState<{ base64: string; previewUri: string } | null>(null);
  // Optional "why I saved this" -- only shown for a photo/link save (a plain
  // text save already is a freeform note, so a second box next to it would
  // just be two text inputs saying the same kind of thing).
  const [note, setNote] = useState(route.params?.sharedNote ?? '');
  const [status, setStatus] = useState<Status>('input');
  // This month's AI organize allowance, for the bubble over 저장하기.
  const [plan, setPlan] = useState<Plan | null>(null);
  useEffect(() => {
    fetchPlan()
      .then(setPlan)
      .catch(() => {});
  }, []);
  const [saved, setSaved] = useState<ApiItem | null>(null);
  const [error, setError] = useState('');

  // Several photos (an album multi-pick or a multi-share) switch this
  // sheet into a dedicated multi-select mode (mutually exclusive with the
  // text/link/single-image flow above it) -- tapping thumbnails toggles
  // them, and submit saves every selected one. One tile behaves the same as
  // many; there's no separate "just one" path to keep in sync.
  const [selectedScreenshots, setSelectedScreenshots] = useState<RecentScreenshot[]>([]);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);
  // savedShotIds: the photos whose save went through -- the only ones the
  // "지울까요?" step may delete (a failed one is still only in the gallery).
  const [savedBulk, setSavedBulk] = useState<{ items: ApiItem[]; failed: number; savedShotIds: string[] } | null>(null);

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
          setError(friendlyError(err));
          setStatus('error');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [route.params?.sharedImageUri]);

  // Several images shared at once land straight in bulk mode, already
  // selected -- each is a cache-dir copy, read to base64 at save time.
  const sharedImageUris = route.params?.sharedImageUris;
  const [sharedShots, setSharedShots] = useState<RecentScreenshot[]>([]);
  useEffect(() => {
    if (!sharedImageUris?.length) return;
    const shots = sharedImageUris.map((uri) => ({ id: uri, uri }));
    setSharedShots(shots);
    setSelectedScreenshots(shots);
  }, [sharedImageUris]);

  const doneButton = <SolidButton label={COMMON.ok} theme={theme} onPress={() => close()} />;

  const scrollRef = useRef<ScrollView>(null);
  // Text already in the memo when a voice dictation starts -- live partial
  // transcripts get appended to it instead of overwriting it.
  const voiceBase = useRef('');

  // Request ids for saves (UX-64): kept across retries of the same content,
  // dropped as soon as what would be saved changes.
  const singleRequestId = useRef<string | null>(null);
  const bulkRequestIds = useRef<Record<string, string>>({});
  useEffect(() => {
    singleRequestId.current = null;
  }, [text, linkUrl, image, note]);

  // What was typed by hand survives a close without saving (a failed save,
  // a tap outside): kept in one slot and put back the next time the sheet
  // opens from "+" (no share). A successful save clears it. Shared-in text
  // is never kept -- it can just be shared again.
  const openedByShare = !!(route.params?.sharedText || route.params?.sharedUrl || route.params?.sharedImageUri || route.params?.sharedImageUris?.length);
  const longDraft = useRef<string | null>(null);
  const draftRef = useRef({ text, status });
  draftRef.current = { text, status };
  // The kept draft isn't poured into the box (decision S1, C): someone
  // opening "+" for a new thought would stop at "when did I write this?",
  // and with photos picked it would become every photo's note. It's offered
  // instead -- a line in the empty box's place, tap to bring it back.
  const [offeredDraft, setOfferedDraft] = useState<string | null>(null);
  const offeredRef = useRef<string | null>(null);
  offeredRef.current = offeredDraft;
  useEffect(() => {
    if (!openedByShare) {
      AsyncStorage.getItem(DRAFT_KEY)
        .then((draft) => {
          if (draft) setOfferedDraft(draft);
        })
        .catch(() => {});
    }
    return () => {
      const { text: last, status: end } = draftRef.current;
      // Typed text too long to become a photo's note: kept whatever happens.
      if (longDraft.current) {
        AsyncStorage.setItem(DRAFT_KEY, longDraft.current).catch(() => {});
        return;
      }
      // A sheet opened by a share never touches the "+" draft -- saving a
      // shared link mustn't wipe a thought kept from earlier.
      if (openedByShare) return;
      // Still only offered (not brought back): it stays for next time. If
      // something new was typed and left unsaved, both are kept, the new
      // text on top (UX-93).
      if (offeredRef.current !== null) {
        if (end !== 'done' && last.trim()) AsyncStorage.setItem(DRAFT_KEY, `${last}\n\n${offeredRef.current}`).catch(() => {});
        return;
      }
      if (end === 'done' || !last.trim()) AsyncStorage.removeItem(DRAFT_KEY).catch(() => {});
      else AsyncStorage.setItem(DRAFT_KEY, last).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const close = () => navigation.goBack();
  // While photos are being saved, leaving would stop the batch partway with
  // no result screen -- 취소, a tap outside, the grabber and the back button
  // all wait until it's done.
  const saving = status === 'saving';
  const closeUnlessSaving = () => {
    if (!saving) close();
  };
  useEffect(() => {
    if (!saving) return;
    const unsubscribe = navigation.addListener('beforeRemove', (e) => e.preventDefault());
    return unsubscribe;
  }, [saving, navigation]);

  // Picking a photo and typing a memo are mutually exclusive in this sheet
  // -- picking one clears the others rather than trying to send several.
  // allowsMultipleSelection lets the OS picker itself offer multi-select;
  // when more than one actually comes back, this routes into the bulk-save
  // path (submitBulk only ever needs .uri per item, read fresh via
  // File().base64() there) instead of only ever keeping assets[0].
  // The system photo picker needs no photo permission -- Cortex holds none.
  const pickFromLibrary = async () => {
    // No base64 / re-encode on native: asking the picker for both made it
    // decode and re-compress every selected photo before returning, so a
    // 30-photo pick sat on the picker for a long while. The file is read
    // only when it's actually saved (and the server compresses it anyway).
    // Web can't read the file later (expo-file-system), so it still asks.
    const onWeb = Platform.OS === 'web';
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      base64: onWeb,
      quality: onWeb ? 0.8 : 1,
      allowsMultipleSelection: true,
    });
    if (result.canceled || result.assets.length === 0) return;

    if (result.assets.length > 1) {
      // The memo box stays: with several photos it's their shared note.
      setLinkUrl(null);
      setImage(null);
      setNote('');
      setStatus('input');
      setSelectedScreenshots(result.assets.map((a) => ({ id: a.assetId ?? a.uri, uri: a.uri, base64: a.base64 ?? undefined })));
      return;
    }

    const asset = result.assets[0];
    if (!asset) return;
    const base64 = asset.base64 ?? (await new File(asset.uri).base64().catch(() => null));
    if (!base64) return;
    carryTextToNote();
    setLinkUrl(null);
    setSelectedScreenshots([]);
    setStatus('input');
    setImage({ base64, previewUri: asset.uri });
  };

  // Picking one photo turns the sheet into a photo save, whose box is the
  // note -- so what was typed moves there (a note holds 1000, and the box
  // grows with it). Longer text
  // isn't cut: it's kept as the "+" draft instead (UX-78).
  // Shared-in text is held only for "사진 지우고 다시 선택", never as the
  // "+" draft (UX-92).
  const carriedText = useRef<string | null>(null);
  const carryTextToNote = () => {
    const typed = text.trim();
    if (typed.length > NOTE_MAX) {
      carriedText.current = typed;
      if (!openedByShare) {
        longDraft.current = typed;
        showToast(S.draftKept);
      }
      setNote('');
    } else {
      setNote(typed);
    }
    setText('');
  };

  // "사진 지우고 다시 선택": back to the memo box, with what was typed (and
  // moved to the photo's note) back in it.
  const dropPhoto = () => {
    setImage(null);
    if (carriedText.current && !text.trim()) {
      setText(carriedText.current);
      carriedText.current = null;
      longDraft.current = null;
    } else if (!text.trim() && note.trim()) {
      setText(note);
      setNote('');
    }
  };

  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      permissionToast(S.camera, perm.canAskAgain);
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ base64: true, quality: 0.8 });
    const asset = result.canceled ? null : result.assets[0];
    if (!asset?.base64) return;
    carryTextToNote();
    setLinkUrl(null);
    setSelectedScreenshots([]);
    setStatus('input');
    setImage({ base64: asset.base64, previewUri: asset.uri });
  };

  // Tapping a thumbnail in the batch toggles it in/out.
  const toggleScreenshot = (shot: RecentScreenshot) => {
    // The memo box stays: with photos selected it's their shared note.
    setLinkUrl(null);
    setImage(null);
    setNote('');
    setSelectedScreenshots((current) =>
      current.some((s) => s.id === shot.id) ? current.filter((s) => s.id !== shot.id) : [...current, shot]
    );
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
    let lastError: unknown = null;
    setBulkProgress({ done: 0, total: selectedScreenshots.length });

    // What's in the memo box goes to every photo as its 내 메모 -- the
    // classifier reads it as the person's own words for each one.
    const sharedNote = text.trim() || undefined;

    for (let start = 0; start < selectedScreenshots.length; start += BULK_CONCURRENCY) {
      const batch = selectedScreenshots.slice(start, start + BULK_CONCURRENCY);
      await Promise.all(
        batch.map(async (shot, offset) => {
          try {
            const base64 = shot.base64 ?? (await new File(shot.uri).base64());
            // Same photo + memo again (a retry after a timeout) -> same id.
            const key = `${shot.id}
${sharedNote ?? ''}`;
            const requestId = (bulkRequestIds.current[key] ??= newRequestId());
            results[start + offset] = await saveScreenshotItem('other', base64, sharedNote, requestId);
          } catch (err) {
            // left as null -- counted as a failure below
            lastError = err;
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
      setError(lastError ? friendlyError(lastError) : S.allFailed);
      setStatus('error');
      return;
    }
    const shots = selectedScreenshots;
    const savedShotIds = shots.filter((_, i) => results[i] !== null).map((s) => s.id);
    setSavedBulk({ items, failed, savedShotIds });
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
    // A memo carrying one link (pasted with the phone's own paste, maybe
    // with a shop name around it) is saved as that link, so it gets a
    // title/thumbnail and opens -- the words around it become its note.
    const typed = !image && !linkUrl ? splitLinkText(text) : null;
    const url = linkUrl ?? typed?.url ?? null;
    const trimmedNote = note.trim() || typed?.note || undefined;
    // One id per thing being saved: pressing 저장 again after a timeout
    // reuses it, so a save that did land comes back instead of doubling.
    const requestId = (singleRequestId.current ??= newRequestId());
    const request = image
      ? saveScreenshotItem('other', image.base64, trimmedNote, requestId)
      : url
        ? saveLinkItem(guessSourceFromUrl(url), url, trimmedNote, requestId)
        : saveTextItem('memo', text.trim(), undefined, requestId);
    request
      .then((item) => {
        setSaved(item);
        setStatus('done');
      })
      .catch((err) => {
        setError(friendlyError(err));
        setStatus('error');
      });
  };

  // Shared-in photos and album picks; shared ones stay after a deselect.
  const gridScreenshots: RecentScreenshot[] = [];
  for (const shot of [...sharedShots, ...selectedScreenshots]) {
    if (!gridScreenshots.some((g) => g.id === shot.id)) gridScreenshots.push(shot);
  }
  // What this save will do with AI: where it goes when AI can't take it,
  // otherwise the uses left -- for several photos always, for a single save
  // only once they're running low.
  const aiLeft = plan ? Math.max(0, plan.classify.limit - plan.classify.used) : null;
  const saveCount = selectedScreenshots.length > 0 ? selectedScreenshots.length : 1;
  const noConsent = !!plan && plan.aiConsent !== undefined && plan.aiConsent !== 'agreed';
  const quotaBubble =
    aiLeft === null
      ? ''
      : noConsent
        ? S.quotaNoConsent
        : aiLeft === 0
          ? S.quotaUsedUp
          : saveCount > aiLeft
            ? S.quotaOver(saveCount - aiLeft)
            : saveCount > 1 || isLowOnUses(aiLeft)
              ? USES.left(aiLeft)
              : '';

  const bulkUnclassified = savedBulk ? savedBulk.items.filter((it) => it.classification_status === 'unclassified').length : 0;
  const bulkConsent = !!savedBulk?.items.some((it) => it.unclassified_reason === 'consent');

  const screenshotGrid = (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.screenshotRow}>
      {gridScreenshots.map((shot) => {
        const selected = selectedScreenshots.some((s) => s.id === shot.id);
        return (
          <Pressable key={shot.id} onPress={() => toggleScreenshot(shot)} disabled={status === 'saving'}>
            <Image
              source={{ uri: shot.uri }}
              style={[styles.screenshotThumb, { borderColor: selected ? theme.ink : theme.line, borderWidth: selected ? 2 : 1 }]}
            />
            {selected && (
              <View style={[styles.screenshotCheck, { backgroundColor: theme.ink }]}>
                <CheckIcon size={11} color={theme.bg} strokeWidth={2.2} />
              </View>
            )}
          </Pressable>
        );
      })}
    </ScrollView>
  );

  return (
    <ModalSheet theme={theme} onClose={closeUnlessSaving} paddingBottom={32} maxHeightRatio={0.86} liftForKeyboard>
        {status === 'input' || status === 'saving' || status === 'error' ? (
          <>
          {/* This sheet is a native-stack "transparentModal", rendered on
              Android inside a BottomSheetDialog (a separate Dialog window)
              that does NOT get the Activity's windowSoftInputMode=
              "adjustResize". ModalSheet's liftForKeyboard sits the sheet on
              top of the keyboard instead (a KeyboardAvoidingView here left
              the focused field under it). */}
          <View style={styles.flexShrink}>
          <ScrollView ref={scrollRef} style={styles.flexShrink} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Heading theme={theme} offset={2}>
              {S.heading}
            </Heading>
            <Text style={[styles.savedSub, { color: theme.sub }]}>
              {S.intro}
            </Text>

            {image ? (
              <View style={styles.imagePreviewWrap}>
                <Image source={{ uri: image.previewUri }} style={[styles.imagePreview, { borderColor: theme.line }]} />
                <Pressable onPress={dropPhoto} disabled={status === 'saving'}>
                  <Text style={{ color: theme.accent, fontFamily: BODY_KR_MEDIUM, fontSize: 13.5, marginTop: 10 }}>
                    {S.repickPhoto}
                  </Text>
                </Pressable>
              </View>
            ) : linkUrl ? (
              <View style={[styles.linkPreview, { borderColor: theme.line, backgroundColor: 'transparent' }]}>
                <Text style={{ color: theme.accent, fontFamily: BODY_KR_MEDIUM, fontSize: 14 }} numberOfLines={2}>
                  {linkUrl}
                </Text>
                <Pressable onPress={() => setLinkUrl(null)} disabled={status === 'saving'}>
                  <Text style={{ color: theme.sub, fontFamily: BODY_KR, fontSize: 13, marginTop: 10 }}>
                    {S.clearLink}
                  </Text>
                </Pressable>
              </View>
            ) : (
              <>
                <View style={styles.memoRow}>
                <TextInput
                  value={text}
                  onChangeText={setText}
                  multiline
                  editable={status !== 'saving'}
                  onFocus={() => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50)}
                  placeholder={
                    selectedScreenshots.length > 0
                      ? S.memoBulkPlaceholder
                      : S.memoPlaceholder
                  }
                  placeholderTextColor={theme.sub}
                  style={[
                    styles.input,
                    fieldStyle(theme),
                    {
                      marginTop: 0,
                      paddingRight: 44,
                      color: theme.ink,
                      fontFamily: BODY_KR,
                      outlineWidth: 0,
                    },
                  ]}
                />
                {/* Speaking adds onto whatever's already typed rather than
                    replacing it -- this is the main memo, not a one-liner.
                    Sits inside the field's bottom-right corner. */}
                <View style={styles.micInMemo}>
                  <VoiceInputButton
                    theme={theme}
                    onStart={() => {
                      voiceBase.current = text.trim() ? `${text.trimEnd()} ` : '';
                    }}
                    onResult={(spoken) => setText(voiceBase.current + spoken)}
                  />
                </View>
                </View>

                {offeredDraft !== null && !text.trim() && selectedScreenshots.length === 0 && (
                  <Pressable
                    onPress={() => {
                      setText(offeredDraft);
                      setOfferedDraft(null);
                    }}
                    hitSlop={6}
                    style={styles.draftLine}
                  >
                    <Text style={{ fontSize: 13, color: theme.sub, fontFamily: BODY_KR }}>
                      {S.draftWaiting}
                      <Text style={{ color: theme.ink, fontFamily: BODY_KR_MEDIUM }}>{S.draftLoad}</Text>
                    </Text>
                  </Pressable>
                )}

                {/* Same pill shape + border convention as GhostButton (the
                    bottom 취소/저장 row) -- just not the component itself,
                    since GhostButton's full size/label scale was built for
                    a primary action, not a pair of small pickers. */}
                <View style={styles.photoButtonRow}>
                  <Pressable
                    onPress={pickFromLibrary}
                    disabled={status === 'saving'}
                    style={({ pressed }) => [styles.photoButton, pickStyle(theme), { opacity: pressed ? 0.6 : 1 }]}
                  >
                    <Text style={pickTextStyle(theme)}>
                      {S.pickAlbum}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={takePhoto}
                    disabled={status === 'saving'}
                    style={({ pressed }) => [styles.photoButton, pickStyle(theme), { opacity: pressed ? 0.6 : 1 }]}
                  >
                    <Text style={pickTextStyle(theme)}>
                      {S.takePhoto}
                    </Text>
                  </Pressable>
                </View>

                {gridScreenshots.length > 0 ? (
                  <View style={styles.screenshotSection}>
                    <View style={styles.bulkHeader}>
                      <Text style={[styles.screenshotLabel, { color: theme.sub, marginBottom: 0 }]}>
                        {S.selectedCount(selectedScreenshots.length)}
                      </Text>
                      {selectedScreenshots.length > 0 && (
                        <Pressable
                          onPress={() => {
                            setSelectedScreenshots([]);
                          }}
                          disabled={status === 'saving'}
                        >
                          <Text style={{ color: theme.accent, fontFamily: BODY_KR_MEDIUM, fontSize: 12.5 }}>
                            {S.clearSelection}
                          </Text>
                        </Pressable>
                      )}
                    </View>
                    {screenshotGrid}
                    {status === 'saving' && bulkProgress && (
                      <Text style={[styles.screenshotLabel, { color: theme.sub, marginTop: 10 }]}>
                        {S.savingProgress(bulkProgress.done, bulkProgress.total)}
                      </Text>
                    )}
                  </View>
                ) : null}
              </>
            )}

            {(image || linkUrl) && selectedScreenshots.length === 0 && (
              <View style={styles.noteRow}>
                <TextInput
                  value={note}
                  onChangeText={setNote}
                  editable={status !== 'saving'}
                  maxLength={NOTE_MAX}
                  multiline
                  placeholder={S.notePlaceholder}
                  placeholderTextColor={theme.sub}
                  style={[
                    styles.input,
                    styles.noteInput,
                    fieldStyle(theme),
                    {
                      paddingRight: 44,
                      color: theme.ink,
                      fontFamily: BODY_KR,
                      outlineWidth: 0,
                    },
                  ]}
                />
                <View style={styles.micInNote}>
                  <VoiceInputButton theme={theme} onResult={(text) => setNote(text)} />
                </View>
              </View>
            )}

            {status === 'error' && (
              <Text style={{ color: theme.danger, marginTop: 10, fontFamily: BODY_KR }}>
                {S.saveFailed(error)}
              </Text>
            )}
          </ScrollView>
          </View>

            {quotaBubble !== '' && <Bubble theme={theme} label={quotaBubble} tail="down" tailInset={40} style={styles.quotaBubble} />}

            <ButtonRow theme={theme} style={styles.buttonRow}>
              <GhostButton label={COMMON.cancel} theme={theme} onPress={close} disabled={saving} />
              <SolidButton
                label={selectedScreenshots.length > 1 ? S.saveN(selectedScreenshots.length) : S.save}
                theme={theme}
                onPress={submit}
                loading={status === 'saving'}
              />
            </ButtonRow>
          </>
        ) : savedBulk ? (
          <>
            <View style={styles.savedHead}>
              <View
                style={[
                  styles.savedMark,
                  {
                    width: 40,
                    height: 40,
                    backgroundColor: filledMark ? theme.accent + '26' : 'transparent',
                    ...allEdges(filledMark ? 0 : OUTLINE, theme.accent),
                  },
                ]}
              >
                <CheckIcon size={18} color={theme.accent} strokeWidth={1.7} />
              </View>
              <View style={styles.savedHeadBody}>
                <Text
                  style={{
                    fontFamily: BODY_KR,
                    fontSize: 12.5,
                    letterSpacing: emToTracking(0.02, 12.5),
                    color: theme.accent,
                  }}
                >
                  {txt.savedLabel}
                </Text>
                <Heading theme={theme} offset={2} style={{ marginTop: 8 }}>
                  {S.savedN(savedBulk.items.length)}
                </Heading>
                {savedBulk.failed > 0 && (
                  <Text style={[styles.savedSub, { color: theme.danger }]}>{S.failedN(savedBulk.failed)}</Text>
                )}
                {bulkUnclassified > 0 && (
                  <Text style={[styles.savedSub, { color: theme.sub }]}>
                    {bulkConsent
                      ? S.unclassifiedConsentN(bulkUnclassified)
                      : S.unclassifiedQuotaN(bulkUnclassified)}
                  </Text>
                )}
              </View>
            </View>

            <ScrollView style={styles.bulkResultList} showsVerticalScrollIndicator={false}>
              {savedBulk.items.map((item) => {
                // Past the month's allowance an item waits in 미분류함 -- it
                // reads '정리 대기 · 사진' (itemTitle), not '(제목 없음) · 기타'.
                const pending = item.classification_status === 'pending' || item.classification_status === 'unclassified';
                return (
                  <Card key={item.id} theme={theme} style={styles.bulkResultRow}>
                    <Text
                      style={[
                        styles.bulkResultTitle,
                        { color: pending ? theme.sub : theme.ink, fontStyle: pending ? 'italic' : 'normal' },
                      ]}
                      numberOfLines={1}
                    >
                      {itemTitle(item)}
                    </Text>
                  </Card>
                );
              })}
            </ScrollView>

            <ButtonRow theme={theme} style={styles.buttonRow}>
              {bulkUnclassified > 0 &&
                (bulkConsent ? (
                  <GhostButton label={S.aiConsent} theme={theme} onPress={() => navigation.replace('AiConsent')} />
                ) : (
                  <GhostButton label={S.proNow} theme={theme} onPress={() => navigation.replace('Paywall', { reason: 'classify' })} />
                ))}
              {doneButton}
            </ButtonRow>
          </>
        ) : (
          saved && (
            <>
              <View style={styles.savedHead}>
                <View
                  style={[
                    styles.savedMark,
                    {
                      width: 40,
                      height: 40,
                      backgroundColor: filledMark ? theme.accent + '26' : 'transparent',
                      ...allEdges(filledMark ? 0 : OUTLINE, theme.accent),
                    },
                  ]}
                >
                  <CheckIcon size={18} color={theme.accent} strokeWidth={1.7} />
                </View>
                <View style={styles.savedHeadBody}>
                  <Text
                    style={{
                      fontFamily: BODY_KR,
                      fontSize: 12.5,
                      letterSpacing: emToTracking(0.02, 12.5),
                      color: theme.accent,
                    }}
                  >
                    {txt.savedLabel}
                  </Text>
                  <Heading theme={theme} offset={2} style={{ marginTop: 8 }}>
                    {txt.savedTitle}
                  </Heading>
                  <Text style={[styles.savedSub, { color: theme.sub }]}>{S.findLater}</Text>
                </View>
              </View>

              <View style={styles.savedCard}>
              <Card
                theme={theme}
                style={
                  isBoxed(theme)
                    ? { padding: 16, paddingHorizontal: 18 }
                    : { ...allEdges(0, 'transparent'), borderTopWidth: 1, borderTopColor: theme.line, paddingTop: 20, paddingBottom: 0 }
                }
              >
                <View style={styles.savedCardMeta}>
                  <Text style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: emToTracking(0.12, 10.5), color: theme.sub }}>
                    {/* 'other' says nothing ("OTHER") -- show what it is (PHOTO) instead. */}
                    {saved.source === 'other' ? captureTypeLabel(saved.capture_type, true) : sourceLabel(saved.source, true)}
                  </Text>
                </View>
                {/* The photo that was just saved -- without it a screenshot
                    save reads like a text memo (title/tags only). */}
                {saved.capture_type === 'screenshot' && image && (
                  <Image source={{ uri: image.previewUri }} style={[styles.savedImage, { borderColor: theme.line }]} resizeMode="cover" />
                )}
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
                    {saved.raw_text && <Text style={[styles.title, { color: theme.ink }]} numberOfLines={4}>{saved.raw_text}</Text>}
                    <View style={styles.analyzingRow}>
                      <ActivityIndicator size="small" color={theme.accent} />
                      <Text style={{ color: theme.sub, fontFamily: BODY_KR, fontSize: 13.5 }}>
                        {S.analyzingTags}
                      </Text>
                    </View>
                  </>
                ) : saved.classification_status === 'unclassified' ? (
                  // Saved past this month's AI quota: kept, but not sorted --
                  // it went to 미분류함. Said plainly, with the way out.
                  <>
                    {saved.raw_text && <Text style={[styles.title, { color: theme.ink }]} numberOfLines={4}>{saved.raw_text}</Text>}
                    <Text style={[styles.snippet, { color: theme.sub }]}>
                      {saved.unclassified_reason === 'consent' ? S.unclassifiedConsent : S.unclassifiedQuota}
                    </Text>
                  </>
                ) : (
                  <>
                    <Text style={[styles.title, { color: theme.ink }]} numberOfLines={4}>{saved.title ?? saved.raw_text}</Text>
                    {saved.snippet && <Text style={[styles.snippet, { color: theme.sub }]}>{saved.snippet}</Text>}
                  </>
                )}
              </Card>
              </View>

              {saved.classification_status !== 'pending' && saved.classification_status !== 'unclassified' && (
                <>
                  <Text
                    style={{
                      fontFamily: BODY_KR,
                      fontSize: 13,
                      letterSpacing: emToTracking(0.01, 13),
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

              <ButtonRow theme={theme} style={styles.buttonRow}>
                {/* Waiting in 미분류함: Pro is the way forward. Otherwise the
                    detail sheet waits out the analysis and shows the result,
                    tags ready to fix -- no hunting for it on home. */}
                {saved.classification_status === 'unclassified' ? (
                  saved.unclassified_reason === 'consent' ? (
                    <GhostButton label={S.aiConsent} theme={theme} onPress={() => navigation.replace('AiConsent')} />
                  ) : (
                    <GhostButton label={S.proNow} theme={theme} onPress={() => navigation.replace('Paywall', { reason: 'classify' })} />
                  )
                ) : (
                  <GhostButton label={S.open} theme={theme} onPress={() => navigation.replace('ItemDetail', { item: saved })} />
                )}
                {doneButton}
              </ButtonRow>
            </>
          )
        )}
    </ModalSheet>
  );
}

const styles = StyleSheet.create({
  draftLine: { marginTop: 8 },
  flexShrink: { flexShrink: 1 },
  photoButtonRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  photoButton: { flex: 1, borderWidth: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  imagePreviewWrap: { marginTop: 18, alignItems: 'center' },
  imagePreview: { width: '100%', aspectRatio: 1, borderRadius: 14, borderWidth: 1 },
  savedImage: { width: '100%', aspectRatio: 4 / 3, borderRadius: 12, borderWidth: 1, marginBottom: 12 },
  linkPreview: { marginTop: 18, borderWidth: 1, borderRadius: 14, padding: 16 },
  savedHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  savedMark: { borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  savedHeadBody: { flex: 1 },
  savedSub: { fontSize: 13.5, marginTop: 7, lineHeight: 21.6, fontFamily: BODY_KR },
  savedCard: { marginTop: 22 },
  savedCardMeta: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  title: { fontSize: 15.5, lineHeight: 22.5, fontFamily: BODY_KR },
  snippet: { fontSize: 13, marginTop: 7, lineHeight: 20.8, fontFamily: BODY_KR },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  buttonRow: { marginTop: 26 },
  quotaBubble: { alignSelf: 'flex-end', marginTop: 18, marginBottom: -12 },
  input: {
    marginTop: 18,
    minHeight: 90,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    fontSize: 15,
    textAlignVertical: 'top',
  },
  noteRow: { position: 'relative', marginTop: 14 },
  memoRow: { position: 'relative', marginTop: 18 },
  micInMemo: { position: 'absolute', right: 4, bottom: 6 },
  micInNote: { position: 'absolute', right: 4, top: 0, bottom: 0, justifyContent: 'center' },
  noteInput: { marginTop: 0, minHeight: 0, maxHeight: 160, paddingVertical: 12, fontSize: 13.5, textAlignVertical: 'top' },
  analyzingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  screenshotSection: { marginTop: 18 },
  bulkHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  newTagBox: { borderWidth: 1, borderStyle: 'dashed', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6, alignSelf: 'flex-start' },
  screenshotLabel: { fontSize: 12.5, marginBottom: 8, fontFamily: BODY_KR },
  permissionHintText: { fontSize: 13, lineHeight: 19, fontFamily: BODY_KR },
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
  bulkResultTitle: { flex: 1, fontSize: 13.5, fontFamily: BODY_KR },
});
