import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { fetchAllItems, type ApiItem } from '../api/client';
import { SOURCE_CATALOG } from './sourceCatalog';
import { categoryLabel } from '../i18n/common';
import { strings } from '../i18n';

const S = strings({
  ko: {
    heading: (date: string, n: number) => `Cortex 메모 · ${date} · ${n}개`,
    photosNote: (n: number) => `사진 ${n}장은 앱에서 볼 수 있어요`,
    myNote: '내 메모',
    photo: '[사진]',
    untitled: '(제목 없음)',
  },
  en: {
    heading: (date: string, n: number) => `Cortex memos · ${date} · ${n}`,
    photosNote: (n: number) => `${n} photos stay in the app`,
    myNote: 'My note',
    photo: '[Photo]',
    untitled: '(Untitled)',
  },
  ja: {
    heading: (date: string, n: number) => `Cortex メモ · ${date} · ${n}件`,
    photosNote: (n: number) => `写真${n}枚はアプリで見られます`,
    myNote: '自分のメモ',
    photo: '[写真]',
    untitled: '(タイトルなし)',
  },
  'zh-Hans': {
    heading: (date: string, n: number) => `Cortex 笔记 · ${date} · ${n} 条`,
    photosNote: (n: number) => `${n} 张照片可在应用中查看`,
    myNote: '我的备注',
    photo: '[照片]',
    untitled: '(无标题)',
  },
  'zh-Hant': {
    heading: (date: string, n: number) => `Cortex 筆記 · ${date} · ${n} 則`,
    photosNote: (n: number) => `${n} 張照片可在應用程式中查看`,
    myNote: '我的備註',
    photo: '[照片]',
    untitled: '(無標題)',
  },
});

const day = (iso: string) => iso.slice(0, 10);
const FILE_PREFIX = 'cortex-memos-';

// One memo: title, when/where/category, what was saved, the person's own
// note, and its tags last -- all as stored, no AI.
function block(item: ApiItem): string {
  const tags = [...item.tags, ...item.user_tags.filter((t) => !item.tags.includes(t))];
  const meta = [day(item.shared_at), SOURCE_CATALOG[item.source]?.label ?? item.source, categoryLabel(item.category)];
  const body =
    item.capture_type === 'text'
      ? item.raw_text
      : [item.capture_type === 'screenshot' ? S.photo : null, item.snippet, item.raw_url].filter(Boolean).join('\n');
  return [
    `## ${item.title?.trim() || S.untitled}`,
    meta.join(' · '),
    body?.trim() || null,
    item.user_note?.trim() ? `${S.myNote}: ${item.user_note.trim()}` : null,
    tags.length ? tags.map((t) => `#${t}`).join(' ') : null,
  ]
    .filter(Boolean)
    .join('\n\n');
}

// A file from an earlier export (it may hold locked memos) doesn't pile
// up in the app's cache.
function clearOldExports() {
  try {
    for (const entry of Paths.cache.list()) {
      if (entry instanceof File && entry.name.startsWith(FILE_PREFIX)) entry.delete();
    }
  } catch {}
}

// 메모 내보내기 (decision B1, 2026-10-29): every memo outside the trash as
// one plain-text file, handed to the system share sheet (Drive, mail,
// Files ...). Photos are marked, not attached -- that's for after launch
// (10-30). Locked memos are included: the caller asks for the PIN first.
export async function exportMemos(): Promise<number> {
  clearOldExports();
  const { items } = await fetchAllItems();
  const today = day(new Date().toISOString());
  const photos = items.filter((it) => it.capture_type === 'screenshot').length;
  const head = [`# ${S.heading(today, items.length)}`, photos ? S.photosNote(photos) : null].filter(Boolean).join('\n\n');
  const text = [head, ...items.map(block)].join('\n\n---\n\n') + '\n';
  const name = `${FILE_PREFIX}${today}.txt`;
  // Left in the cache after sharing: Gmail and others read it only when
  // they send, so it's cleared at the next export instead.
  const file = new File(Paths.cache, name);
  file.create();
  file.write(text);
  await Sharing.shareAsync(file.uri, { mimeType: 'text/plain', dialogTitle: name });
  return items.length;
}
