import type { ItemCaptureType, ItemSource } from "./supabase.js";

// The single place that knows about each channel (source) and method
// (capture_type) -- display labels (mirrors mobile/src/data/sourceCatalog.ts,
// which the client can't import across the repo boundary) and what
// fetchLinkMetadata can realistically collect for a 'link' item from that
// channel, confirmed live against real URLs: YouTube's oEmbed is fully
// reliable, generic web (og:tags) is decent, Instagram post pages return
// almost nothing to a non-browser request. Not yet used to gate the
// pipeline's fetch attempt -- it's a documented starting point for that,
// and the thing searchItems checks a query against below.
export interface SourceCatalogEntry {
  id: ItemSource;
  label: string;
  labelEn: string;
  collects: { title: boolean; thumbnail: boolean; description: boolean };
}

export const SOURCE_CATALOG: Record<ItemSource, SourceCatalogEntry> = {
  youtube: { id: "youtube", label: "유튜브", labelEn: "youtube", collects: { title: true, thumbnail: true, description: true } },
  instagram: { id: "instagram", label: "인스타그램", labelEn: "instagram", collects: { title: false, thumbnail: false, description: false } },
  kakaotalk: { id: "kakaotalk", label: "카카오톡", labelEn: "kakaotalk", collects: { title: false, thumbnail: false, description: false } },
  safari: { id: "safari", label: "사파리", labelEn: "safari", collects: { title: true, thumbnail: true, description: true } },
  memo: { id: "memo", label: "메모", labelEn: "memo", collects: { title: false, thumbnail: false, description: false } },
  other: { id: "other", label: "기타", labelEn: "other", collects: { title: false, thumbnail: false, description: false } },
};

export interface CaptureTypeCatalogEntry {
  id: ItemCaptureType;
  label: string;
  labelEn: string;
}

export const CAPTURE_TYPE_CATALOG: Record<ItemCaptureType, CaptureTypeCatalogEntry> = {
  link: { id: "link", label: "링크", labelEn: "link" },
  text: { id: "text", label: "메모", labelEn: "text" },
  screenshot: { id: "screenshot", label: "사진", labelEn: "screenshot" },
};
