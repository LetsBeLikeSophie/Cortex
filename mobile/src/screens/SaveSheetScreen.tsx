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
import MediaLibrary from '../native/mediaLibrary';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useTheme } from '../theme/ThemeContext';
import { MONO, OUTLINE, allEdges, conceptOf, emToTracking } from '../theme/themes';
import { Card, frameStyle, isBoxed } from '../components/Card';
import { copyFor } from '../data/content';
import { saveTextItem, saveLinkItem, saveScreenshotItem, addTag, fetchPlan, ApiItem, ItemSource, Plan, friendlyError } from '../api/client';
import { itemTitle, sourceLabel } from '../api/format';
import { CheckIcon } from '../components/Icons';
import { TagChip, TagAddChip } from '../components/Chips';
import { Heading } from '../components/Typography';
import { ModalSheet } from '../components/ModalSheet';
import { ButtonRow, GhostButton, SolidButton } from '../components/Buttons';
import { VoiceInputButton } from '../components/VoiceInputButton';
import { permissionToast } from '../native/toast';
import { fieldStyle, pickStyle, pickTextStyle } from '../components/Fields';
import { splitLinkText } from '../data/linkText';
import { useRecentScreenshots, RecentScreenshot } from '../hooks/useRecentScreenshots';
import type { RootStackParamList } from '../navigation/types';
import { strings } from '../i18n';
import { COMMON, categoryLabel } from '../i18n/common';

const S = strings({
  ko: {
    photoAccess: '사진 접근',
    camera: '카메라',
    allFailed: '전부 저장하지 못했어요',
    quotaNoConsent: 'AI 분석 동의 전이라 미분류함에 들어가요 (저장은 돼요)',
    quotaBulk: (n: number) => `AI가 한 장씩 제목·태그를 달아요 · 이번 달 ${n}건 남음`,
    quotaOver: (n: number) => `${n}장은 미분류함에 들어가요 (저장은 돼요)`,
    quotaUsedUp: '이번 달 AI 정리를 다 써서 미분류함에 들어가요 (저장은 돼요)',
    quotaLeft: (n: number) => `이번 달 AI 정리 ${n}건 남음`,
    heading: '무엇을 저장할까요?',
    intro: '다른 앱에서 공유하거나, 텍스트를 붙여넣거나 사진을 골라서 저장해요.',
    repickPhoto: '사진 지우고 다시 선택',
    clearLink: '지우고 직접 입력',
    memoBulkPlaceholder: '고른 사진들에 같이 남길 메모 (선택) — 예: 제주 여행 맛집들',
    memoPlaceholder: '예: 성수동에 새로 생긴 크로플 맛집 완전 대박이래',
    pickAlbum: '앨범에서 선택',
    takePhoto: '카메라로 촬영',
    selectedCount: (n: number) => `${n}장 선택됨`,
    recentMulti: '최근 스크린샷 · 여러 장 선택 가능',
    clearSelection: '선택 취소',
    savingProgress: (done: number, total: number) => `${done}/${total}장 저장 중...`,
    loadRecent: '최근 스크린샷 불러오기',
    noRecent: '최근 스크린샷이 없어요. 앨범에서 선택해 주세요.',
    recent: '최근 스크린샷',
    recentDenied: '사진 접근 권한이 꺼져 있어서 최근 스크린샷을 불러올 수 없어요. 설정에서 허용해주세요.',
    notePlaceholder: '왜 저장했는지 한 줄 적어두면 나중에 찾기 쉬워요 (선택)',
    saveFailed: (e: string) => `저장 실패: ${e}`,
    saveN: (n: number) => `${n}장 저장하기`,
    save: '저장하기',
    savedN: (n: number) => `${n}개 저장했어요`,
    failedN: (n: number) => `${n}개는 저장하지 못했어요.`,
    unclassifiedConsentN: (n: number) => `${n}개는 AI 분석 동의 전이라 미분류함에 넣어뒀어요`,
    unclassifiedQuotaN: (n: number) => `${n}개는 이번 달 AI 정리를 다 써서 미분류함에 넣어뒀어요`,
    originalsDeleted: '원본 사진을 지웠어요. 저장한 건 Cortex에 그대로 있어요.',
    deleteOriginalsQ: (n: number) => `정리한 원본 사진 ${n}장을 지울까요?`,
    failedKept: (n: number) => `저장에 실패한 ${n}장은 지우지 않아요.`,
    galleryOnly: '갤러리에서만 지워지고, Cortex에는 그대로 남아요.',
    keep: '그대로 두기',
    deleteOriginals: '원본 지우기',
    aiConsent: 'AI 분석 동의',
    proNow: 'Pro로 바로 정리',
    findLater: '단어 하나만 적으면 다시 꺼내 드려요.',
    analyzingTags: '제목·태그를 분석하고 있어요',
    unclassifiedConsent: 'AI 분석 동의 전이라 미분류함에 넣어뒀어요',
    unclassifiedQuota: '이번 달 AI 정리를 다 써서 미분류함에 넣어뒀어요',
    open: '열어 보기',
  },
  en: {
    photoAccess: 'Photo',
    camera: 'Camera',
    allFailed: "Couldn't save any of them",
    quotaNoConsent: 'No AI consent yet, so it goes to Unsorted (still saved)',
    quotaBulk: (n: number) => `AI titles and tags each photo · ${n} left this month`,
    quotaOver: (n: number) => `${n} will go to Unsorted (still saved)`,
    quotaUsedUp: "This month's AI sorting is used up, so it goes to Unsorted (still saved)",
    quotaLeft: (n: number) => `${n} AI sorts left this month`,
    heading: 'What do you want to save?',
    intro: 'Share from another app, paste text, or pick a photo.',
    repickPhoto: 'Remove photo and pick again',
    clearLink: 'Clear and type instead',
    memoBulkPlaceholder: 'A note for all these photos (optional) — e.g. Jeju food spots',
    memoPlaceholder: 'e.g. That new croffle place in Seongsu is amazing',
    pickAlbum: 'Pick from album',
    takePhoto: 'Take a photo',
    selectedCount: (n: number) => `${n} selected`,
    recentMulti: 'Recent screenshots · pick several',
    clearSelection: 'Clear',
    savingProgress: (done: number, total: number) => `Saving ${done}/${total}...`,
    loadRecent: 'Load recent screenshots',
    noRecent: 'No recent screenshots. Pick from your album.',
    recent: 'Recent screenshots',
    recentDenied: "Photo access is off, so recent screenshots can't load. Allow it in Settings.",
    notePlaceholder: 'Why you saved it, in a line — easier to find later (optional)',
    saveFailed: (e: string) => `Couldn't save: ${e}`,
    saveN: (n: number) => `Save ${n}`,
    save: 'Save',
    savedN: (n: number) => `Saved ${n}`,
    failedN: (n: number) => `${n} couldn't be saved.`,
    unclassifiedConsentN: (n: number) => `${n} went to Unsorted (no AI consent yet)`,
    unclassifiedQuotaN: (n: number) => `${n} went to Unsorted (AI sorting used up this month)`,
    originalsDeleted: 'Originals deleted. Your saves are still in Cortex.',
    deleteOriginalsQ: (n: number) => (n === 1 ? 'Delete the original photo?' : `Delete the ${n} original photos?`),
    failedKept: (n: number) => `The ${n} that failed to save won't be deleted.`,
    galleryOnly: 'Only removed from your gallery — they stay in Cortex.',
    keep: 'Keep',
    deleteOriginals: 'Delete originals',
    aiConsent: 'Allow AI',
    proNow: 'Sort now with Pro',
    findLater: 'Just type one word to bring it back.',
    analyzingTags: 'Working out title and tags',
    unclassifiedConsent: 'Put in Unsorted (no AI consent yet)',
    unclassifiedQuota: "Put in Unsorted (this month's AI sorting is used up)",
    open: 'Open',
  },
  ja: {
    photoAccess: '写真',
    camera: 'カメラ',
    allFailed: 'どれも保存できませんでした',
    quotaNoConsent: 'AI分析に未同意のため未分類に入ります(保存はされます)',
    quotaBulk: (n: number) => `AIが1枚ずつタイトル・タグを付けます · 今月残り${n}件`,
    quotaOver: (n: number) => `${n}枚は未分類に入ります(保存はされます)`,
    quotaUsedUp: '今月のAI整理を使い切ったので未分類に入ります(保存はされます)',
    quotaLeft: (n: number) => `今月のAI整理 残り${n}件`,
    heading: '何を保存しますか?',
    intro: '他のアプリから共有、テキストを貼り付け、または写真を選んで保存します。',
    repickPhoto: '写真を消して選び直す',
    clearLink: '消して直接入力',
    memoBulkPlaceholder: '選んだ写真に付けるメモ(任意) — 例: 済州旅行のグルメ',
    memoPlaceholder: '例: 聖水にできたクロッフルの店、すごく美味しいらしい',
    pickAlbum: 'アルバムから選ぶ',
    takePhoto: 'カメラで撮る',
    selectedCount: (n: number) => `${n}枚選択中`,
    recentMulti: '最近のスクリーンショット · 複数選択OK',
    clearSelection: '選択解除',
    savingProgress: (done: number, total: number) => `${done}/${total}枚 保存中...`,
    loadRecent: '最近のスクリーンショットを読み込む',
    noRecent: '最近のスクリーンショットはありません。アルバムから選んでください。',
    recent: '最近のスクリーンショット',
    recentDenied: '写真へのアクセスがオフのため読み込めません。設定で許可してください。',
    notePlaceholder: '保存した理由を一言メモすると後で探しやすいです(任意)',
    saveFailed: (e: string) => `保存できませんでした: ${e}`,
    saveN: (n: number) => `${n}枚を保存`,
    save: '保存する',
    savedN: (n: number) => `${n}件保存しました`,
    failedN: (n: number) => `${n}件は保存できませんでした。`,
    unclassifiedConsentN: (n: number) => `${n}件はAI分析に未同意のため未分類に入れました`,
    unclassifiedQuotaN: (n: number) => `${n}件は今月のAI整理を使い切ったため未分類に入れました`,
    originalsDeleted: '元の写真を削除しました。保存したものはCortexに残っています。',
    deleteOriginalsQ: (n: number) => `整理した元の写真${n}枚を削除しますか?`,
    failedKept: (n: number) => `保存に失敗した${n}枚は削除しません。`,
    galleryOnly: 'ギャラリーから消えるだけで、Cortexには残ります。',
    keep: 'そのままにする',
    deleteOriginals: '元の写真を削除',
    aiConsent: 'AI分析に同意',
    proNow: 'Proですぐ整理',
    findLater: '単語ひとつで、また呼び出せます。',
    analyzingTags: 'タイトルとタグを分析中です',
    unclassifiedConsent: 'AI分析に未同意のため未分類に入れました',
    unclassifiedQuota: '今月のAI整理を使い切ったため未分類に入れました',
    open: '開く',
  },
  'zh-Hans': {
    photoAccess: '照片访问',
    camera: '相机',
    allFailed: '全部保存失败',
    quotaNoConsent: '尚未同意 AI 分析，将放入未分类（照样保存）',
    quotaBulk: (n: number) => `AI 会逐张添加标题和标签 · 本月剩余 ${n} 次`,
    quotaOver: (n: number) => `${n} 张将放入未分类（照样保存）`,
    quotaUsedUp: '本月 AI 整理已用完，将放入未分类（照样保存）',
    quotaLeft: (n: number) => `本月 AI 整理剩余 ${n} 次`,
    heading: '要保存什么？',
    intro: '从其他应用分享、粘贴文字，或选张照片来保存。',
    repickPhoto: '删除照片并重选',
    clearLink: '清除并手动输入',
    memoBulkPlaceholder: '给所选照片一起加备注（可选）— 例：济州旅行美食',
    memoPlaceholder: '例：圣水洞新开的可颂华夫店超好吃',
    pickAlbum: '从相册选择',
    takePhoto: '拍照',
    selectedCount: (n: number) => `已选 ${n} 张`,
    recentMulti: '最近截图 · 可多选',
    clearSelection: '取消选择',
    savingProgress: (done: number, total: number) => `正在保存 ${done}/${total} 张...`,
    loadRecent: '加载最近截图',
    noRecent: '没有最近截图，请从相册选择。',
    recent: '最近截图',
    recentDenied: '照片访问权限已关闭，无法加载最近截图。请在设置中允许。',
    notePlaceholder: '写一句为什么保存，以后更好找（可选）',
    saveFailed: (e: string) => `保存失败：${e}`,
    saveN: (n: number) => `保存 ${n} 张`,
    save: '保存',
    savedN: (n: number) => `已保存 ${n} 项`,
    failedN: (n: number) => `${n} 项保存失败。`,
    unclassifiedConsentN: (n: number) => `${n} 项因尚未同意 AI 分析，已放入未分类`,
    unclassifiedQuotaN: (n: number) => `${n} 项因本月 AI 整理已用完，已放入未分类`,
    originalsDeleted: '原图已删除，保存的内容仍在 Cortex 中。',
    deleteOriginalsQ: (n: number) => `删除已整理的 ${n} 张原图？`,
    failedKept: (n: number) => `保存失败的 ${n} 张不会删除。`,
    galleryOnly: '只从相册删除，Cortex 中仍会保留。',
    keep: '保留',
    deleteOriginals: '删除原图',
    aiConsent: '同意 AI 分析',
    proNow: '用 Pro 立即整理',
    findLater: '只需输入一个词，就能再找回来。',
    analyzingTags: '正在分析标题和标签',
    unclassifiedConsent: '尚未同意 AI 分析，已放入未分类',
    unclassifiedQuota: '本月 AI 整理已用完，已放入未分类',
    open: '打开',
  },
  'zh-Hant': {
    photoAccess: '照片存取',
    camera: '相機',
    allFailed: '全部儲存失敗',
    quotaNoConsent: '尚未同意 AI 分析，將放入未分類（照樣儲存）',
    quotaBulk: (n: number) => `AI 會逐張加上標題和標籤 · 本月剩餘 ${n} 次`,
    quotaOver: (n: number) => `${n} 張將放入未分類（照樣儲存）`,
    quotaUsedUp: '本月 AI 整理已用完，將放入未分類（照樣儲存）',
    quotaLeft: (n: number) => `本月 AI 整理剩餘 ${n} 次`,
    heading: '要儲存什麼？',
    intro: '從其他 App 分享、貼上文字，或選張照片來儲存。',
    repickPhoto: '刪除照片並重選',
    clearLink: '清除並手動輸入',
    memoBulkPlaceholder: '為所選照片一起加備註（選填）— 例：濟州旅行美食',
    memoPlaceholder: '例：聖水洞新開的可頌鬆餅店超好吃',
    pickAlbum: '從相簿選擇',
    takePhoto: '拍照',
    selectedCount: (n: number) => `已選 ${n} 張`,
    recentMulti: '最近截圖 · 可多選',
    clearSelection: '取消選擇',
    savingProgress: (done: number, total: number) => `正在儲存 ${done}/${total} 張...`,
    loadRecent: '載入最近截圖',
    noRecent: '沒有最近截圖，請從相簿選擇。',
    recent: '最近截圖',
    recentDenied: '照片存取權限已關閉，無法載入最近截圖。請在設定中允許。',
    notePlaceholder: '寫一句為什麼儲存，之後更好找（選填）',
    saveFailed: (e: string) => `儲存失敗：${e}`,
    saveN: (n: number) => `儲存 ${n} 張`,
    save: '儲存',
    savedN: (n: number) => `已儲存 ${n} 項`,
    failedN: (n: number) => `${n} 項儲存失敗。`,
    unclassifiedConsentN: (n: number) => `${n} 項因尚未同意 AI 分析，已放入未分類`,
    unclassifiedQuotaN: (n: number) => `${n} 項因本月 AI 整理已用完，已放入未分類`,
    originalsDeleted: '原圖已刪除，儲存的內容仍在 Cortex 中。',
    deleteOriginalsQ: (n: number) => `刪除已整理的 ${n} 張原圖？`,
    failedKept: (n: number) => `儲存失敗的 ${n} 張不會刪除。`,
    galleryOnly: '只從相簿刪除，Cortex 中仍會保留。',
    keep: '保留',
    deleteOriginals: '刪除原圖',
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

// No reliable way to know which app a share came from (Android's generic
// ACTION_SEND doesn't carry the sender's identity), but a link's own domain
// is a good enough guess to avoid dumping every URL into 'other'.
// Gallery asset ids MediaLibrary can delete. An album pick that came back
// without an assetId uses its file uri as the id (pickFromLibrary) -- there
// is nothing to delete through the media library for those.
function deletableIds(ids: string[]): string[] {
  return ids.filter((id) => !id.includes('://') && !id.startsWith('/'));
}

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
  // This month's AI organize allowance, for the line above 저장하기.
  const [plan, setPlan] = useState<Plan | null>(null);
  useEffect(() => {
    fetchPlan()
      .then(setPlan)
      .catch(() => {});
  }, []);
  const [saved, setSaved] = useState<ApiItem | null>(null);
  const [error, setError] = useState('');

  // Picking any screenshot from the "최근 스크린샷" row below switches this
  // sheet into a dedicated multi-select mode (mutually exclusive with the
  // text/link/single-image flow above it) -- tapping thumbnails toggles
  // them, and submit saves every selected one. One tile behaves the same as
  // many; there's no separate "just one" path to keep in sync.
  const [selectedScreenshots, setSelectedScreenshots] = useState<RecentScreenshot[]>([]);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);
  // savedShotIds: the photos whose save went through -- the only ones the
  // "지울까요?" step may delete (a failed one is still only in the gallery).
  const [savedBulk, setSavedBulk] = useState<{ items: ApiItem[]; failed: number; savedShotIds: string[] } | null>(null);
  const [deleteOriginalState, setDeleteOriginalState] = useState<'idle' | 'deleting' | 'done' | 'kept'>('idle');
  const {
    screenshots: recentScreenshots,
    needsPermission: screenshotsNeedPermission,
    permissionDenied: screenshotsPermissionDenied,
    empty: screenshotsEmpty,
    loading: screenshotsLoading,
    requestAccess: requestScreenshotAccess,
  } = useRecentScreenshots();

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
  // selected -- each is a cache-dir copy, read to base64 at save time like a
  // recent-screenshot tile. Their ids are file:// uris, so deletableIds keeps
  // the "원본 지울까요?" step away from them (the sender owns the originals).
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
  // when more than one actually comes back, this routes into the same
  // bulk-save path "최근 스크린샷"'s multi-select already uses (submitBulk
  // only ever needs .uri per item, read fresh via File().base64() there,
  // so a picked asset's uri works exactly like a recent-screenshot's)
  // instead of only ever keeping assets[0] and silently dropping the rest.
  const pickFromLibrary = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      permissionToast(S.photoAccess, perm.canAskAgain);
      return;
    }
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
    setText('');
    setLinkUrl(null);
    setNote('');
    setSelectedScreenshots([]);
    setStatus('input');
    setImage({ base64, previewUri: asset.uri });
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
    setText('');
    setLinkUrl(null);
    setNote('');
    setSelectedScreenshots([]);
    setStatus('input');
    setImage({ base64: asset.base64, previewUri: asset.uri });
  };

  // Tapping a "최근 스크린샷" thumbnail toggles it in/out of the batch --
  // selecting the first one is what switches the sheet into bulk mode.
  const toggleScreenshot = (shot: RecentScreenshot) => {
    // The memo box stays: with photos selected it's their shared note.
    setLinkUrl(null);
    setImage(null);
    setNote('');
    setSelectedScreenshots((current) =>
      current.some((s) => s.id === shot.id) ? current.filter((s) => s.id !== shot.id) : [...current, shot]
    );
  };

  const deleteOriginalScreenshots = async () => {
    const ids = savedBulk ? deletableIds(savedBulk.savedShotIds) : [];
    if (ids.length === 0 || !MediaLibrary) return;
    setDeleteOriginalState('deleting');
    try {
      await MediaLibrary.Asset.delete(ids.map((id) => new MediaLibrary!.Asset(id)));
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
            results[start + offset] = await saveScreenshotItem('other', base64, sharedNote);
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
    const request = image
      ? saveScreenshotItem('other', image.base64, trimmedNote)
      : url
        ? saveLinkItem(guessSourceFromUrl(url), url, trimmedNote)
        : saveTextItem('memo', text.trim());
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

  // Shared-in photos and album picks that aren't in the recent row lead it,
  // so the batch is always visible (shared ones stay after a deselect).
  const gridScreenshots: RecentScreenshot[] = [];
  for (const shot of [...sharedShots, ...selectedScreenshots, ...recentScreenshots]) {
    if (!gridScreenshots.some((g) => g.id === shot.id)) gridScreenshots.push(shot);
  }
  // What this save will do to the month's AI organize count: for several
  // photos always (and how many will wait in 미분류함 past the allowance);
  // for a single save only once it's running low.
  const aiLeft = plan ? Math.max(0, plan.classify.limit - plan.classify.used) : null;
  const saveCount = selectedScreenshots.length > 0 ? selectedScreenshots.length : 1;
  const noConsent = !!plan && plan.aiConsent !== undefined && plan.aiConsent !== 'agreed';
  const quotaLine =
    aiLeft === null
      ? ''
      : noConsent
        ? S.quotaNoConsent
        : saveCount > 1
        ? [S.quotaBulk(aiLeft), saveCount > aiLeft ? S.quotaOver(saveCount - aiLeft) : null]
            .filter(Boolean)
            .join('\n')
        : aiLeft === 0
          ? S.quotaUsedUp
          : aiLeft <= 10
            ? S.quotaLeft(aiLeft)
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
                <Pressable onPress={() => setImage(null)} disabled={status === 'saving'}>
                  <Text style={{ color: theme.accent, fontFamily: 'IBMPlexSansKR_500Medium', fontSize: 13.5, marginTop: 10 }}>
                    {S.repickPhoto}
                  </Text>
                </Pressable>
              </View>
            ) : linkUrl ? (
              <View style={[styles.linkPreview, { borderColor: theme.line, backgroundColor: 'transparent' }]}>
                <Text style={{ color: theme.accent, fontFamily: 'IBMPlexSansKR_500Medium', fontSize: 14 }} numberOfLines={2}>
                  {linkUrl}
                </Text>
                <Pressable onPress={() => setLinkUrl(null)} disabled={status === 'saving'}>
                  <Text style={{ color: theme.sub, fontFamily: 'IBMPlexSansKR_400Regular', fontSize: 13, marginTop: 10 }}>
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
                      fontFamily: 'IBMPlexSansKR_400Regular',
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
                        {selectedScreenshots.length > 0
                          ? S.selectedCount(selectedScreenshots.length)
                          : S.recentMulti}
                      </Text>
                      {selectedScreenshots.length > 0 && (
                        <Pressable
                          onPress={() => {
                            setSelectedScreenshots([]);
                          }}
                          disabled={status === 'saving'}
                        >
                          <Text style={{ color: theme.accent, fontFamily: 'IBMPlexSansKR_500Medium', fontSize: 12.5 }}>
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
                ) : screenshotsNeedPermission ? (
                  // Asked only when tapped -- not the moment the sheet opens.
                  <View style={styles.screenshotSection}>
                    {screenshotsLoading ? (
                      <ActivityIndicator size="small" color={theme.accent} style={{ alignSelf: 'flex-start' }} />
                    ) : (
                      <Pressable onPress={requestScreenshotAccess} hitSlop={6}>
                        <Text style={[styles.permissionHintText, { color: theme.accent }]}>{S.loadRecent}</Text>
                      </Pressable>
                    )}
                  </View>
                ) : screenshotsEmpty ? (
                  <View style={styles.screenshotSection}>
                    <Text style={[styles.screenshotLabel, { color: theme.sub }]}>{S.noRecent}</Text>
                  </View>
                ) : (
                  screenshotsPermissionDenied && (
                    <View style={styles.screenshotSection}>
                      <Text style={[styles.screenshotLabel, { color: theme.sub }]}>{S.recent}</Text>
                      <Pressable onPress={() => Linking.openSettings()}>
                        <Text style={[styles.permissionHintText, { color: theme.accent }]}>
                          {S.recentDenied}
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
                  placeholder={S.notePlaceholder}
                  placeholderTextColor={theme.sub}
                  style={[
                    styles.input,
                    styles.noteInput,
                    fieldStyle(theme),
                    {
                      paddingRight: 44,
                      color: theme.ink,
                      fontFamily: 'IBMPlexSansKR_400Regular',
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
              <Text style={{ color: theme.danger, marginTop: 10, fontFamily: 'IBMPlexSansKR_400Regular' }}>
                {S.saveFailed(error)}
              </Text>
            )}
          </ScrollView>
          </View>

            {quotaLine !== '' && <Text style={[styles.quotaLine, { color: theme.sub }]}>{quotaLine}</Text>}

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
                    fontFamily: 'IBMPlexSansKR_400Regular',
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

            {/* Clearing the gallery is usually why the photos were brought
                in -- so once they're safely saved, ask plainly. Only the ones
                that actually saved can go (Android adds its own confirm). */}
            {savedBulk && deletableIds(savedBulk.savedShotIds).length > 0 && deleteOriginalState !== 'kept' && (
              <View style={[styles.deleteOriginalCard, frameStyle(theme), { borderRadius: theme.cardRadius }]}>
                {deleteOriginalState === 'done' ? (
                  <Text style={[styles.deleteOriginalText, { color: theme.sub }]}>{S.originalsDeleted}</Text>
                ) : (
                  <>
                    <Text style={[styles.deleteOriginalTitle, { color: theme.ink }]}>
                      {S.deleteOriginalsQ(deletableIds(savedBulk.savedShotIds).length)}
                    </Text>
                    <Text style={[styles.deleteOriginalText, { color: theme.sub }]}>
                      {savedBulk.failed > 0
                        ? S.failedKept(savedBulk.failed)
                        : S.galleryOnly}
                    </Text>
                    <View style={styles.deleteOriginalButtons}>
                      <GhostButton label={S.keep} theme={theme} size="sm" onPress={() => setDeleteOriginalState('kept')} disabled={deleteOriginalState === 'deleting'} />
                      <SolidButton label={S.deleteOriginals} theme={theme} size="sm" flex={1} variant="danger" onPress={deleteOriginalScreenshots} loading={deleteOriginalState === 'deleting'} />
                    </View>
                  </>
                )}
              </View>
            )}

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
                      fontFamily: 'IBMPlexSansKR_400Regular',
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
                    {sourceLabel(saved.source, true)}
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
                    {saved.raw_text && <Text style={[styles.title, { color: theme.ink }]}>{saved.raw_text}</Text>}
                    <View style={styles.analyzingRow}>
                      <ActivityIndicator size="small" color={theme.accent} />
                      <Text style={{ color: theme.sub, fontFamily: 'IBMPlexSansKR_400Regular', fontSize: 13.5 }}>
                        {S.analyzingTags}
                      </Text>
                    </View>
                  </>
                ) : saved.classification_status === 'unclassified' ? (
                  // Saved past this month's AI quota: kept, but not sorted --
                  // it went to 미분류함. Said plainly, with the way out.
                  <>
                    {saved.raw_text && <Text style={[styles.title, { color: theme.ink }]}>{saved.raw_text}</Text>}
                    <Text style={[styles.snippet, { color: theme.sub }]}>
                      {saved.unclassified_reason === 'consent' ? S.unclassifiedConsent : S.unclassifiedQuota}
                    </Text>
                  </>
                ) : (
                  <>
                    <Text style={[styles.title, { color: theme.ink }]}>{saved.title ?? saved.raw_text}</Text>
                    {saved.snippet && <Text style={[styles.snippet, { color: theme.sub }]}>{saved.snippet}</Text>}
                  </>
                )}
              </Card>
              </View>

              {saved.classification_status !== 'pending' && saved.classification_status !== 'unclassified' && (
                <>
                  <Text
                    style={{
                      fontFamily: 'IBMPlexSansKR_400Regular',
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
  savedSub: { fontSize: 13.5, marginTop: 7, lineHeight: 21.6, fontFamily: 'IBMPlexSansKR_400Regular' },
  savedCard: { marginTop: 22 },
  savedCardMeta: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  title: { fontSize: 15.5, lineHeight: 22.5, fontFamily: 'IBMPlexSansKR_400Regular' },
  snippet: { fontSize: 13, marginTop: 7, lineHeight: 20.8, fontFamily: 'IBMPlexSansKR_400Regular' },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  buttonRow: { marginTop: 26 },
  quotaLine: { fontSize: 12.5, lineHeight: 18, marginTop: 18, marginBottom: -12, fontFamily: 'IBMPlexSansKR_400Regular' },
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
  noteInput: { marginTop: 0, minHeight: 0, paddingVertical: 12, fontSize: 13.5 },
  analyzingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  screenshotSection: { marginTop: 18 },
  bulkHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  newTagBox: { borderWidth: 1, borderStyle: 'dashed', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6, alignSelf: 'flex-start' },
  screenshotLabel: { fontSize: 12.5, marginBottom: 8, fontFamily: 'IBMPlexSansKR_400Regular' },
  permissionHintText: { fontSize: 13, lineHeight: 19, fontFamily: 'IBMPlexSansKR_400Regular' },
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
  deleteOriginalCard: { marginTop: 16, padding: 16, gap: 6 },
  deleteOriginalTitle: { fontSize: 14.5, fontFamily: 'IBMPlexSansKR_500Medium' },
  deleteOriginalButtons: { flexDirection: 'row', gap: 10, marginTop: 10 },
  deleteOriginalText: { fontSize: 12.5, lineHeight: 18, fontFamily: 'IBMPlexSansKR_400Regular' },
});
