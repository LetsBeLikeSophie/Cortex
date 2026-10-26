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
import { MONO, emToTracking } from '../theme/themes';
import { addTag, asQuotaError, deleteItem, reportAiOutput, setItemLocked, fetchComposeSources, fetchItem, fetchPlan, getScreenshotUrl, reorganizeItem, removeAiTag as removeAiTagApi, removeTag as removeTagApi, updateItem, friendlyError } from '../api/client';
import { relativeTime, sourceLabel, captureTypeLabel, itemTitle } from '../api/format';
import { TagChip, TagAddChip } from '../components/Chips';
import { ButtonRow, GhostButton, IconButton, SolidButton } from '../components/Buttons';
import { LockIcon, ReportIcon, ShareIcon, SparkleIcon, TrashIcon, SourceIcon } from '../components/Icons';
import { ModalSheet } from '../components/ModalSheet';
import { ConfirmCard } from '../components/ConfirmCard';
import { ImageViewer } from '../components/ImageViewer';
import { MemoText, refsIn, plainMemo } from '../components/MemoText';
import { VoiceInputButton } from '../components/VoiceInputButton';
import { Heading } from '../components/Typography';
import type { ApiItem } from '../api/client';
import type { RootStackParamList } from '../navigation/types';
import { strings } from '../i18n';
import { COMMON, categoryLabel } from '../i18n/common';
import { LOCK_SUPPORTED, askPin, hasPin } from '../lock/memoLock';

type DeleteState = 'idle' | 'confirming' | 'deleting';
// snippet (the AI memo) isn't typed into -- it's only ever replaced by the
// AI or put back with undo -- but it shares the save/undo plumbing.
type EditField = 'title' | 'snippet' | 'rawText' | 'userNote';

const REORGANIZE_POLL_MS = 2000;
const SNACK_MS = 6000;

// S.edited: "<field>을/를 바꿨어요" for the undo bar after a manual edit.

const S = strings({
  ko: {
    edited: { title: '제목을 바꿨어요', snippet: 'AI 메모를 바꿨어요', rawText: '본문을 바꿨어요', userNote: '내 메모를 바꿨어요' } as Record<EditField, string>,
    organizeFailed: 'AI 정리에 실패했어요. 잠시 후 다시 시도해 주세요.',
    taggedText: 'AI가 제목·태그를 달았어요',
    taggedFull: 'AI가 제목·메모·태그를 달았어요',
    reorganizedText: 'AI가 제목·태그를 다시 정리했어요',
    reorganizedFull: 'AI가 제목·메모·태그를 다시 정리했어요',
    leftThisMonth: (n: number) => ` · 이번 달 ${n}건 남음`,
    reorganize: 'AI로 다시 정리',
    myNoteShare: (note: string) => `내 메모: ${note}`,
    share: '공유',
    moveToTrash: '휴지통으로 이동',
    composedFrom: (tag: string, n: number) => `'${tag}' 메모 ${n}개로 만들었어요`,
    composeLeft: (n: number) => ` · 이번 달 ${n}회 남음`,
    otherShape: '다른 모양으로 →',
    otherShapeFree: '다른 모양으로 다시 · 무료 →',
    hideSources: '원본 메모 접기',
    showSources: (n: number) => `원본 메모 ${n}개 보기`,
    notInMemo: (n: number) => `글에 안 나온 메모 ${n}개`,
    loading: '불러오는 중...',
    sourcesDeleted: (n: number) => `${n}개는 지워졌어요`,
    trashTitle: '휴지통으로 이동할까요?',
    trashBody: '나중에 홈 위쪽 휴지통에서 복원할 수 있어요.',
    deleteFailed: (e: string) => `삭제 실패: ${e}`,
    lockFailed: (e: string) => `잠금을 바꾸지 못했어요: ${e}`,
    bioPrompt: '잠긴 메모 열기',
    open: '열기',
    lockedBody: '비밀번호나 지문으로 열 수 있어요. 잠긴 메모는 AI 검색과 모아서 만들기에서 빠져요.',
    lockedTitle: '잠긴 메모예요',
    unlock: '잠금 풀기',
    lock: '메모 잠그기',
    reportFailed: (e: string) => `신고하지 못했어요: ${e}`,
    reported: '신고했어요. 확인할게요.',
    reportSend: '신고',
    reportBody: '부적절하거나 잘못된 제목·메모·태그를 알려주세요. 운영자가 확인해요.',
    reportTitle: 'AI가 만든 내용을 신고할까요?',
    report: 'AI 결과 신고',
    organizing: 'AI가 정리하는 중...',
    noTitle: '제목 없음',
    newTag: '새 태그',
    addTag: '+ 태그',
    tagSaveFailed: '태그 저장 실패: ',
    composeFromTag: '태그로 모아서 만들기',
    tapToEdit: '눌러서 편집',
    imageFailed: '이미지를 불러오지 못했어요.',
    aiMemo: 'AI 메모',
    waitConsent: 'AI 분석 동의 전에 저장됨 · ✦로 정리 (1건)',
    waitFailed: 'AI 정리에 실패했어요 · ✦로 다시 정리 (1건)',
    waitQuotaOut: '이번 달 AI 정리를 다 써서 기다리는 중이에요 · ✦로 이것만 정리 (1건)',
    waitQuota: 'AI 정리를 기다리는 중이에요 · ✦로 이것만 정리 (1건)',
    waitOther: 'AI 정리가 아직 안 됐어요 · ✦로 다시 정리 (1건)',
    noAiMemo: '아직 AI 메모가 없어요',
    myNotePlaceholder: '내 메모 — 말하거나 눌러서 적어요',
    bodyPlaceholder: '본문 — 말하거나 눌러서 적어요',
    saved: (when: string) => `${when} 저장됨`,
    undo: '되돌리기',
    remade: '다시 만들었어요',
    openLink: '링크 열기',
  },
  en: {
    edited: { title: 'Title changed', snippet: 'AI note changed', rawText: 'Text changed', userNote: 'My note changed' },
    organizeFailed: "AI couldn't sort this. Try again in a bit.",
    taggedText: 'AI added a title and tags',
    taggedFull: 'AI added a title, note and tags',
    reorganizedText: 'AI redid the title and tags',
    reorganizedFull: 'AI redid the title, note and tags',
    leftThisMonth: (n: number) => ` · ${n} left this month`,
    reorganize: 'Sort again with AI',
    myNoteShare: (note: string) => `My note: ${note}`,
    share: 'Share',
    moveToTrash: 'Move to trash',
    composedFrom: (tag: string, n: number) => `Made from ${n} '${tag}' items`,
    composeLeft: (n: number) => ` · ${n} left this month`,
    otherShape: 'Remake in another shape →',
    otherShapeFree: 'Remake in another shape · free →',
    hideSources: 'Hide source items',
    showSources: (n: number) => `Show ${n} source items`,
    notInMemo: (n: number) => `${n} not in the memo`,
    loading: 'Loading...',
    sourcesDeleted: (n: number) => `${n} deleted`,
    trashTitle: 'Move to trash?',
    trashBody: 'You can restore it from the trash at the top of Home.',
    deleteFailed: (e: string) => `Couldn't delete: ${e}`,
    lockFailed: (e: string) => `Couldn't change the lock: ${e}`,
    bioPrompt: 'Open locked memo',
    open: 'Open',
    lockedBody: 'Open it with your PIN or fingerprint. Locked memos are left out of AI search and Combine.',
    lockedTitle: 'This memo is locked',
    unlock: 'Unlock memo',
    lock: 'Lock memo',
    reportFailed: (e: string) => `Couldn't report: ${e}`,
    reported: "Reported. Thanks, we'll take a look.",
    reportSend: 'Report',
    reportBody: 'Tell us if a title, memo or tag is wrong or inappropriate. We review every report.',
    reportTitle: 'Report what the AI wrote?',
    report: 'Report AI result',
    organizing: 'AI is sorting...',
    noTitle: 'Untitled',
    newTag: 'New tag',
    addTag: '+ Tag',
    tagSaveFailed: "Couldn't save tag: ",
    composeFromTag: 'Combine by tag',
    tapToEdit: 'Tap to edit',
    imageFailed: "Couldn't load the image.",
    aiMemo: 'AI note',
    waitConsent: 'Saved before AI consent · sort with ✦ (1 use)',
    waitFailed: "AI couldn't sort this · retry with ✦ (1 use)",
    waitQuotaOut: 'Waiting: AI quota used up this month · sort just this with ✦ (1 use)',
    waitQuota: 'Waiting for AI · sort just this with ✦ (1 use)',
    waitOther: 'Not sorted by AI yet · retry with ✦ (1 use)',
    noAiMemo: 'No AI note yet',
    myNotePlaceholder: 'My note — speak or tap to write',
    bodyPlaceholder: 'Text — speak or tap to write',
    saved: (when: string) => `saved ${when}`,
    undo: 'Undo',
    remade: 'Remade',
    openLink: 'Open link',
  },
  ja: {
    edited: { title: 'タイトルを変更しました', snippet: 'AIメモを変更しました', rawText: '本文を変更しました', userNote: '自分のメモを変更しました' },
    organizeFailed: 'AIの整理に失敗しました。少ししてからもう一度お試しください。',
    taggedText: 'AIがタイトルとタグを付けました',
    taggedFull: 'AIがタイトル・メモ・タグを付けました',
    reorganizedText: 'AIがタイトルとタグを整理し直しました',
    reorganizedFull: 'AIがタイトル・メモ・タグを整理し直しました',
    leftThisMonth: (n: number) => ` · 今月あと${n}件`,
    reorganize: 'AIで整理し直す',
    myNoteShare: (note: string) => `自分のメモ: ${note}`,
    share: '共有',
    moveToTrash: 'ゴミ箱に移動',
    composedFrom: (tag: string, n: number) => `「${tag}」のメモ${n}件から作りました`,
    composeLeft: (n: number) => ` · 今月あと${n}回`,
    otherShape: '別の形で作り直す →',
    otherShapeFree: '別の形で作り直す · 無料 →',
    hideSources: '元のメモを閉じる',
    showSources: (n: number) => `元のメモ${n}件を見る`,
    notInMemo: (n: number) => `本文にないメモ${n}件`,
    loading: '読み込み中...',
    sourcesDeleted: (n: number) => `${n}件は削除されました`,
    trashTitle: 'ゴミ箱に移動しますか？',
    trashBody: 'あとでホーム上部のゴミ箱から復元できます。',
    deleteFailed: (e: string) => `削除できませんでした: ${e}`,
    lockFailed: (e: string) => `ロックを変更できませんでした: ${e}`,
    bioPrompt: 'ロックされたメモを開く',
    open: '開く',
    lockedBody: '暗証番号か指紋で開けます。ロック中のメモはAI検索と「まとめて作る」から外れます。',
    lockedTitle: 'ロックされたメモです',
    unlock: 'ロックを解除',
    lock: 'メモをロック',
    reportFailed: (e: string) => `報告できませんでした: ${e}`,
    reported: '報告しました。確認します。',
    reportSend: '報告',
    reportBody: '不適切・誤ったタイトル、メモ、タグをお知らせください。運営が確認します。',
    reportTitle: 'AIが作った内容を報告しますか？',
    report: 'AI結果を報告',
    organizing: 'AIが整理中...',
    noTitle: 'タイトルなし',
    newTag: '新しいタグ',
    addTag: '+ タグ',
    tagSaveFailed: 'タグを保存できませんでした: ',
    composeFromTag: 'タグでまとめて作る',
    tapToEdit: 'タップして編集',
    imageFailed: '画像を読み込めませんでした。',
    aiMemo: 'AIメモ',
    waitConsent: 'AI分析の同意前に保存 · ✦で整理 (1件)',
    waitFailed: 'AIの整理に失敗しました · ✦で再整理 (1件)',
    waitQuotaOut: '今月のAI整理を使い切ったため待機中 · ✦でこれだけ整理 (1件)',
    waitQuota: 'AIの整理待ちです · ✦でこれだけ整理 (1件)',
    waitOther: 'まだAIで整理されていません · ✦で再整理 (1件)',
    noAiMemo: 'AIメモはまだありません',
    myNotePlaceholder: '自分のメモ — 話すかタップして入力',
    bodyPlaceholder: '本文 — 話すかタップして入力',
    saved: (when: string) => `${when}に保存`,
    undo: '元に戻す',
    remade: '作り直しました',
    openLink: 'リンクを開く',
  },
  'zh-Hans': {
    edited: { title: '标题已修改', snippet: 'AI 备注已修改', rawText: '正文已修改', userNote: '我的备注已修改' },
    organizeFailed: 'AI 整理失败了，请稍后再试。',
    taggedText: 'AI 已添加标题和标签',
    taggedFull: 'AI 已添加标题、备注和标签',
    reorganizedText: 'AI 已重新整理标题和标签',
    reorganizedFull: 'AI 已重新整理标题、备注和标签',
    leftThisMonth: (n: number) => ` · 本月还剩 ${n} 次`,
    reorganize: '用 AI 重新整理',
    myNoteShare: (note: string) => `我的备注：${note}`,
    share: '分享',
    moveToTrash: '移到回收站',
    composedFrom: (tag: string, n: number) => `由 ${n} 项「${tag}」收藏内容生成`,
    composeLeft: (n: number) => ` · 本月还剩 ${n} 次`,
    otherShape: '换个形式重做 →',
    otherShapeFree: '换个形式重做 · 免费 →',
    hideSources: '收起原始内容',
    showSources: (n: number) => `查看 ${n} 项原始内容`,
    notInMemo: (n: number) => `正文未提到的 ${n} 项`,
    loading: '加载中...',
    sourcesDeleted: (n: number) => `${n} 项已删除`,
    trashTitle: '移到回收站？',
    trashBody: '之后可以在首页上方的回收站恢复。',
    deleteFailed: (e: string) => `删除失败：${e}`,
    lockFailed: (e: string) => `无法更改锁定：${e}`,
    bioPrompt: '打开锁定的笔记',
    open: '打开',
    lockedBody: '可用密码或指纹打开。锁定的笔记不会用于 AI 搜索和汇总生成。',
    lockedTitle: '这条笔记已锁定',
    unlock: '解除锁定',
    lock: '锁定笔记',
    reportFailed: (e: string) => `举报失败：${e}`,
    reported: '已举报，我们会查看。',
    reportSend: '举报',
    reportBody: '如果标题、笔记或标签不当或有误，请告诉我们。我们会逐一查看。',
    reportTitle: '要举报 AI 生成的内容吗？',
    report: '举报 AI 结果',
    organizing: 'AI 整理中...',
    noTitle: '无标题',
    newTag: '新标签',
    addTag: '+ 标签',
    tagSaveFailed: '标签保存失败：',
    composeFromTag: '按标签汇总生成',
    tapToEdit: '点按编辑',
    imageFailed: '图片加载失败。',
    aiMemo: 'AI 备注',
    waitConsent: '在同意 AI 分析前保存 · 点 ✦ 整理 (1 次)',
    waitFailed: 'AI 整理失败了 · 点 ✦ 重新整理 (1 次)',
    waitQuotaOut: '本月 AI 整理次数已用完，等待中 · 点 ✦ 只整理这条 (1 次)',
    waitQuota: '等待 AI 整理 · 点 ✦ 只整理这条 (1 次)',
    waitOther: '还没被 AI 整理 · 点 ✦ 重新整理 (1 次)',
    noAiMemo: '还没有 AI 备注',
    myNotePlaceholder: '我的备注 — 说话或点按输入',
    bodyPlaceholder: '正文 — 说话或点按输入',
    saved: (when: string) => `${when}保存`,
    undo: '撤销',
    remade: '已重新生成',
    openLink: '打开链接',
  },
  'zh-Hant': {
    edited: { title: '標題已修改', snippet: 'AI 備註已修改', rawText: '內文已修改', userNote: '我的備註已修改' },
    organizeFailed: 'AI 整理失敗了，請稍後再試。',
    taggedText: 'AI 已加上標題和標籤',
    taggedFull: 'AI 已加上標題、備註和標籤',
    reorganizedText: 'AI 已重新整理標題和標籤',
    reorganizedFull: 'AI 已重新整理標題、備註和標籤',
    leftThisMonth: (n: number) => ` · 本月還剩 ${n} 次`,
    reorganize: '用 AI 重新整理',
    myNoteShare: (note: string) => `我的備註：${note}`,
    share: '分享',
    moveToTrash: '移到垃圾桶',
    composedFrom: (tag: string, n: number) => `由 ${n} 項「${tag}」收藏內容生成`,
    composeLeft: (n: number) => ` · 本月還剩 ${n} 次`,
    otherShape: '換個形式重做 →',
    otherShapeFree: '換個形式重做 · 免費 →',
    hideSources: '收起原始內容',
    showSources: (n: number) => `查看 ${n} 項原始內容`,
    notInMemo: (n: number) => `內文未提到的 ${n} 項`,
    loading: '載入中...',
    sourcesDeleted: (n: number) => `${n} 項已刪除`,
    trashTitle: '移到垃圾桶？',
    trashBody: '之後可以在首頁上方的垃圾桶還原。',
    deleteFailed: (e: string) => `刪除失敗：${e}`,
    lockFailed: (e: string) => `無法變更鎖定：${e}`,
    bioPrompt: '開啟鎖定的筆記',
    open: '開啟',
    lockedBody: '可用密碼或指紋開啟。鎖定的筆記不會用於 AI 搜尋和彙整生成。',
    lockedTitle: '這則筆記已鎖定',
    unlock: '解除鎖定',
    lock: '鎖定筆記',
    reportFailed: (e: string) => `檢舉失敗：${e}`,
    reported: '已檢舉，我們會查看。',
    reportSend: '檢舉',
    reportBody: '如果標題、筆記或標籤不當或有誤，請告訴我們。我們會逐一查看。',
    reportTitle: '要檢舉 AI 產生的內容嗎？',
    report: '檢舉 AI 結果',
    organizing: 'AI 整理中...',
    noTitle: '無標題',
    newTag: '新標籤',
    addTag: '+ 標籤',
    tagSaveFailed: '標籤儲存失敗：',
    composeFromTag: '依標籤彙整生成',
    tapToEdit: '點按編輯',
    imageFailed: '圖片載入失敗。',
    aiMemo: 'AI 備註',
    waitConsent: '在同意 AI 分析前儲存 · 點 ✦ 整理 (1 次)',
    waitFailed: 'AI 整理失敗了 · 點 ✦ 重新整理 (1 次)',
    waitQuotaOut: '本月 AI 整理次數已用完，等待中 · 點 ✦ 只整理這則 (1 次)',
    waitQuota: '等待 AI 整理 · 點 ✦ 只整理這則 (1 次)',
    waitOther: '還沒被 AI 整理 · 點 ✦ 重新整理 (1 次)',
    noAiMemo: '還沒有 AI 備註',
    myNotePlaceholder: '我的備註 — 說話或點按輸入',
    bodyPlaceholder: '內文 — 說話或點按輸入',
    saved: (when: string) => `${when}儲存`,
    undo: '復原',
    remade: '已重新產生',
    openLink: '開啟連結',
  },
});

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
  // This month's AI organizes left, read while the item waits -- whether it
  // waits because the quota ran out (0) or because the AI failed on it.
  const [classifyLeft, setClassifyLeft] = useState<number | null>(null);
  const [waitReason, setWaitReason] = useState(item.unclassified_reason ?? null);
  // A composed memo's sources, loaded when "원본 N개" is opened (decision Q7).
  const sourceIds = item.composed_from ?? [];
  const isComposed = sourceIds.length > 0 || !!composedFrom;
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
  };
  // Where the memo body starts in the scroll view, and each ref's line in
  // it -- tapping a linked source in the list scrolls the memo there.
  const bodyY = useRef(0);
  const refY = useRef(new Map<number, number>());

  const [deleteState, setDeleteState] = useState<DeleteState>('idle');
  // Memo lock: a locked memo opens behind the device PIN / fingerprint.
  const [locked, setLocked] = useState(!!item.locked);
  const [opened, setOpened] = useState(!item.locked);
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
          fetchPlan()
            .then((p) => what + S.leftThisMonth(Math.max(0, p.classify.limit - p.classify.used)))
            .catch(() => what)
            .then((message) => showSnack(message, () => undoAi(before)));
        })
        .catch(() => {});
    }, REORGANIZE_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [organizing, item.id]);

  useEffect(() => {
    if (!waiting || organizing) return;
    let cancelled = false;
    fetchPlan()
      .then((p) => {
        if (!cancelled) setClassifyLeft(Math.max(0, p.classify.limit - p.classify.used));
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
    <IconButton theme={theme} on="sheet" onPress={reorganize} label={S.reorganize}>
      {organizing ? <ActivityIndicator size="small" color={theme.accent} /> : <SparkleIcon size={15} color={theme.accent} strokeWidth={1.4} />}
    </IconButton>
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
          <Heading theme={theme} size={20} style={styles.lockedTitle}>
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

          {composedFrom && (
            <View style={styles.composedNote}>
              <SparkleIcon size={13} color={theme.accent} strokeWidth={1.5} />
              <Text style={[styles.composedText, { color: theme.sub }]}>
                {S.composedFrom(composedFrom.tag, composedFrom.count)}
                {composedFrom.left !== undefined ? S.composeLeft(composedFrom.left) : ''}
              </Text>
              <Pressable
                onPress={() =>
                  navigation.replace('Compose', {
                    tag: composedFrom.tag,
                    count: composedFrom.count,
                    retryOf: item.id,
                    freeRemake: composedFrom.freeRemake,
                    remakeBefore: { title: savedRef.current.title, rawText: savedRef.current.rawText, edited: handEdited.current },
                  })
                }
                hitSlop={8}
                style={styles.composedAgain}
              >
                <Text style={[styles.composedText, { color: theme.ink, textDecorationLine: 'underline' }]}>{composedFrom.freeRemake ? S.otherShapeFree : S.otherShape}</Text>
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
                  autoFocus
                  onFocus={() => scrollRef.current?.scrollTo({ y: 0, animated: true })}
                  onSubmitEditing={submitNewTag}
                  onBlur={submitNewTag}
                  placeholder={S.newTag}
                  placeholderTextColor={theme.sub}
                  style={{ color: theme.ink, fontFamily: 'IBMPlexSansKR_400Regular', fontSize: 13, padding: 0, minWidth: 60, outlineWidth: 0 }}
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
                <Text style={{ color: theme.sub, fontFamily: 'IBMPlexSansKR_400Regular', padding: 24 }}>
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
            <View style={styles.editRow}>
              <View style={styles.flex1}>
                {/* The person's own words: ink (accent is reserved for AI/status). */}
                {inlineInput('userNote', [styles.body, { color: theme.ink, fontStyle: 'italic' }], S.myNotePlaceholder)}
              </View>
              {voiceButton('userNote')}
            </View>
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
              <View style={styles.editRow}>
                <View style={styles.flex1}>{inlineInput('rawText', [styles.body, { color: theme.ink }], S.bodyPlaceholder)}</View>
                {voiceButton('rawText')}
              </View>
            ))}

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
  lockedGate: { alignItems: 'center', gap: 10, paddingTop: 8 },
  lockedTitle: { textAlign: 'center' },
  sourcesBox: { gap: 6, marginTop: 8 },
  composeEntry: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 8 },
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
