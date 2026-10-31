import type { ApiItem, ItemSource } from '../api/client';
import { strings } from '../i18n';

const L = strings({
  ko: { youtube: '유튜브', instagram: '인스타그램', kakaotalk: '카카오톡', safari: '웹', memo: '메모', other: '기타', link: '링크', text: '메모', screenshot: '사진' },
  en: { youtube: 'YouTube', instagram: 'Instagram', kakaotalk: 'KakaoTalk', safari: 'Web', memo: 'Note', other: 'Other', link: 'Link', text: 'Note', screenshot: 'Photo' },
  ja: { youtube: 'YouTube', instagram: 'Instagram', kakaotalk: 'カカオトーク', safari: 'ウェブ', memo: 'メモ', other: 'その他', link: 'リンク', text: 'メモ', screenshot: '写真' },
  'zh-Hans': { youtube: 'YouTube', instagram: 'Instagram', kakaotalk: 'KakaoTalk', safari: '网页', memo: '笔记', other: '其他', link: '链接', text: '笔记', screenshot: '照片' },
  'zh-Hant': { youtube: 'YouTube', instagram: 'Instagram', kakaotalk: 'KakaoTalk', safari: '網頁', memo: '筆記', other: '其他', link: '連結', text: '筆記', screenshot: '照片' },
});

// The single place that knows about each channel (source) and method
// (capture_type) -- label text and what we can realistically expect to
// collect from it. Everything that displays or searches by channel/method
// should read from here rather than hardcoding its own copy, so adding a
// channel or correcting what it can collect (e.g. once Instagram support
// changes) is a one-file edit instead of a hunt through every screen.
export interface SourceCatalogEntry {
  id: ItemSource;
  label: string;
  labelTech: string;
  // What fetchLinkMetadata can realistically pull for a 'link' item from
  // this channel -- confirmed live against real URLs (see pipeline.ts):
  // YouTube's oEmbed is fully reliable, generic web (og:tags) is decent,
  // Instagram post pages return almost nothing to a non-browser request.
  collects: { title: boolean; thumbnail: boolean; description: boolean };
}

export const SOURCE_CATALOG: Record<ItemSource, SourceCatalogEntry> = {
  youtube: {
    id: 'youtube',
    get label() {
      return L.youtube;
    },
    labelTech: 'YOUTUBE',
    collects: { title: true, thumbnail: true, description: true },
  },
  instagram: {
    id: 'instagram',
    get label() {
      return L.instagram;
    },
    labelTech: 'INSTAGRAM',
    collects: { title: false, thumbnail: false, description: false },
  },
  kakaotalk: {
    id: 'kakaotalk',
    get label() {
      return L.kakaotalk;
    },
    labelTech: 'KAKAOTALK',
    collects: { title: false, thumbnail: false, description: false },
  },
  // Stored as 'safari' (kept for existing items), but it's any browser link
  // -- Chrome on Android too -- so it shows as "웹" / WEB.
  safari: {
    id: 'safari',
    get label() {
      return L.safari;
    },
    labelTech: 'WEB',
    collects: { title: true, thumbnail: true, description: true },
  },
  memo: {
    id: 'memo',
    get label() {
      return L.memo;
    },
    labelTech: 'MEMO',
    collects: { title: false, thumbnail: false, description: false },
  },
  other: {
    id: 'other',
    get label() {
      return L.other;
    },
    labelTech: 'OTHER',
    collects: { title: false, thumbnail: false, description: false },
  },
};

export const SOURCE_ORDER = Object.keys(SOURCE_CATALOG) as ItemSource[];

export interface CaptureTypeCatalogEntry {
  id: ApiItem['capture_type'];
  label: string;
  labelTech: string;
}

export const CAPTURE_TYPE_CATALOG: Record<ApiItem['capture_type'], CaptureTypeCatalogEntry> = {
  link: { id: 'link', get label() { return L.link; }, labelTech: 'LINK' },
  text: { id: 'text', get label() { return L.text; }, labelTech: 'TEXT' },
  screenshot: { id: 'screenshot', get label() { return L.screenshot; }, labelTech: 'SCREENSHOT' },
};
