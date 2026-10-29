import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { fetchAllItems, type ApiItem } from '../api/client';
import { SOURCE_CATALOG } from './sourceCatalog';
import { categoryLabel } from '../i18n/common';
import { strings } from '../i18n';

const S = strings({
  ko: {
    heading: (date: string, n: number) => `Cortex 메모 · ${date} · ${n}개`,
    myNote: '내 메모',
    photo: '[사진 -- 앱에서 볼 수 있어요]',
    untitled: '(제목 없음)',
  },
  en: {
    heading: (date: string, n: number) => `Cortex memos · ${date} · ${n}`,
    myNote: 'My note',
    photo: '[Photo -- open it in the app]',
    untitled: '(Untitled)',
  },
  ja: {
    heading: (date: string, n: number) => `Cortex メモ · ${date} · ${n}件`,
    myNote: '自分のメモ',
    photo: '[写真 -- アプリで見られます]',
    untitled: '(タイトルなし)',
  },
  'zh-Hans': {
    heading: (date: string, n: number) => `Cortex 笔记 · ${date} · ${n} 条`,
    myNote: '我的备注',
    photo: '[照片 -- 可在应用中查看]',
    untitled: '(无标题)',
  },
  'zh-Hant': {
    heading: (date: string, n: number) => `Cortex 筆記 · ${date} · ${n} 則`,
    myNote: '我的備註',
    photo: '[照片 -- 可在應用程式中查看]',
    untitled: '(無標題)',
  },
});

const day = (iso: string) => iso.slice(0, 10);

function block(item: ApiItem): string {
  const tags = [...item.tags, ...item.user_tags.filter((t) => !item.tags.includes(t))];
  const meta = [day(item.shared_at), SOURCE_CATALOG[item.source]?.label ?? item.source, categoryLabel(item.category), ...tags.map((t) => `#${t}`)];
  const body =
    item.capture_type === 'text'
      ? item.raw_text
      : [item.capture_type === 'screenshot' ? S.photo : null, item.snippet, item.raw_url].filter(Boolean).join('\n');
  return [
    `## ${item.title?.trim() || S.untitled}`,
    meta.join(' · '),
    body?.trim() || null,
    item.user_note?.trim() ? `${S.myNote}: ${item.user_note.trim()}` : null,
  ]
    .filter(Boolean)
    .join('\n\n');
}

// 메모 내보내기 (decision B1, 2026-10-29): every memo outside the trash as
// one plain-text file, handed to the system share sheet (Drive, mail,
// Files ...). Photos are named, not attached -- that's for later. Locked
// memos are included: the caller asks for the PIN first.
export async function exportMemos(): Promise<number> {
  const { items: picked } = await fetchAllItems();
  const today = day(new Date().toISOString());
  const text = [`# ${S.heading(today, picked.length)}`, ...picked.map(block)].join('\n\n---\n\n') + '\n';
  const file = new File(Paths.cache, `cortex-memos-${today}.txt`);
  if (file.exists) file.delete();
  file.create();
  file.write(text);
  await Sharing.shareAsync(file.uri, { mimeType: 'text/plain', dialogTitle: `cortex-memos-${today}.txt` });
  return picked.length;
}
