import type { ApiItem, ItemSource } from '../api/client';

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
    label: '유튜브',
    labelTech: 'YOUTUBE',
    collects: { title: true, thumbnail: true, description: true },
  },
  instagram: {
    id: 'instagram',
    label: '인스타그램',
    labelTech: 'INSTAGRAM',
    collects: { title: false, thumbnail: false, description: false },
  },
  kakaotalk: {
    id: 'kakaotalk',
    label: '카카오톡',
    labelTech: 'KAKAOTALK',
    collects: { title: false, thumbnail: false, description: false },
  },
  safari: {
    id: 'safari',
    label: '사파리',
    labelTech: 'SAFARI',
    collects: { title: true, thumbnail: true, description: true },
  },
  memo: {
    id: 'memo',
    label: '메모',
    labelTech: 'MEMO',
    collects: { title: false, thumbnail: false, description: false },
  },
  other: {
    id: 'other',
    label: '기타',
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
  link: { id: 'link', label: '링크', labelTech: 'LINK' },
  text: { id: 'text', label: '메모', labelTech: 'TEXT' },
  screenshot: { id: 'screenshot', label: '사진', labelTech: 'SCREENSHOT' },
};
