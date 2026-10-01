// Fixed top-level categories (must match the `item_category` enum in db/schema.sql).
// Intent-based ("why did I save this") rather than topic-based (the original
// 맛집/여행/레시피/쇼핑/읽을거리/기타) -- a fixed topic list only ever fits the
// use case it was written for, and scales badly the moment someone's archive
// is fandom content, wedding planning, or anything else outside food/travel/
// shopping. An intent covers any topic; the topic itself still comes through
// in tags (freeform, unlike category). "기타" stays as the deliberate
// catch-all. See db/schema.sql for the migration from the old values.
export const CATEGORIES = ["가볼 곳", "살 것", "배울 것", "볼 것", "기억할 것", "기타"] as const;
export type Category = (typeof CATEGORIES)[number];
