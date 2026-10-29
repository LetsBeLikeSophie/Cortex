import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { fetchAllItems, startExportZip, type ApiItem } from '../api/client';
import { SOURCE_CATALOG } from './sourceCatalog';
import { categoryLabel } from '../i18n/common';
import { strings } from '../i18n';

const S = strings({
  ko: {
    heading: (date: string, n: number) => `Cortex 메모 · ${date} · ${n}개`,
    myNote: '내 메모',
    photo: '사진',
    untitled: '(제목 없음)',
  },
  en: {
    heading: (date: string, n: number) => `Cortex memos · ${date} · ${n}`,
    myNote: 'My note',
    photo: 'Photo',
    untitled: '(Untitled)',
  },
  ja: {
    heading: (date: string, n: number) => `Cortex メモ · ${date} · ${n}件`,
    myNote: '自分のメモ',
    photo: '写真',
    untitled: '(タイトルなし)',
  },
  'zh-Hans': {
    heading: (date: string, n: number) => `Cortex 笔记 · ${date} · ${n} 条`,
    myNote: '我的备注',
    photo: '照片',
    untitled: '(无标题)',
  },
  'zh-Hant': {
    heading: (date: string, n: number) => `Cortex 筆記 · ${date} · ${n} 則`,
    myNote: '我的備註',
    photo: '照片',
    untitled: '(無標題)',
  },
});

const day = (iso: string) => iso.slice(0, 10);

type ExportItem = ApiItem & { image_path?: string | null };

// The photo's name in the .zip: date + title, so the folder reads like the
// list ("photos/2026-10-29 카페 메뉴.jpg"); repeats get " (2)".
function photoNames(items: ExportItem[]): Map<string, string> {
  const names = new Map<string, string>();
  const used = new Set<string>();
  for (const item of items) {
    if (item.capture_type !== 'screenshot' || !item.image_path) continue;
    const ext = item.image_path.split('.').pop()?.toLowerCase() || 'jpg';
    const title = (item.title?.trim() || '').replace(/[\\/:*?"<>|\s]+/g, ' ').trim().slice(0, 40);
    const base = `photos/${day(item.shared_at)}${title ? ` ${title}` : ''}`;
    let name = `${base}.${ext}`;
    for (let n = 2; used.has(name.toLowerCase()); n++) name = `${base} (${n}).${ext}`;
    used.add(name.toLowerCase());
    names.set(item.id, name);
  }
  return names;
}

// One memo: title, when/where/category, what was saved, the person's own
// note, and its tags last -- all as stored, no AI.
function block(item: ExportItem, photo: string | undefined): string {
  const tags = [...item.tags, ...item.user_tags.filter((t) => !item.tags.includes(t))];
  const meta = [day(item.shared_at), SOURCE_CATALOG[item.source]?.label ?? item.source, categoryLabel(item.category)];
  const body =
    item.capture_type === 'text'
      ? item.raw_text
      : [photo ? `${S.photo}: ${photo}` : null, item.snippet, item.raw_url].filter(Boolean).join('\n');
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

// 메모 내보내기 (decision B1, 2026-10-29; photos 10-30): every memo outside
// the trash, handed to the system share sheet (Drive, mail, Files ...).
// With no photo memos it's one .txt; otherwise one .zip of that text plus
// the photos as saved. Locked memos are included: the caller asks for the
// PIN first.
export async function exportMemos(): Promise<number> {
  const { items } = await fetchAllItems();
  const today = day(new Date().toISOString());
  const photos = photoNames(items);
  const text = [`# ${S.heading(today, items.length)}`, ...items.map((it) => block(it, photos.get(it.id)))].join('\n\n---\n\n') + '\n';
  const textName = `cortex-memos-${today}.txt`;

  if (photos.size === 0) {
    const file = new File(Paths.cache, textName);
    if (file.exists) file.delete();
    file.create();
    file.write(text);
    await Sharing.shareAsync(file.uri, { mimeType: 'text/plain', dialogTitle: textName });
    return items.length;
  }

  const zipName = `cortex-memos-${today}.zip`;
  const { url, headers } = await startExportZip({
    text,
    textName,
    photos: [...photos].map(([id, name]) => ({ id, name })),
  });
  const zip = new File(Paths.cache, zipName);
  if (zip.exists) zip.delete();
  await File.downloadFileAsync(url, zip, { headers, idempotent: true });
  await Sharing.shareAsync(zip.uri, { mimeType: 'application/zip', dialogTitle: zipName });
  return items.length;
}
