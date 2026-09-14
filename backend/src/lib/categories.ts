// Fixed top-level categories (must match the `item_category` enum in db/schema.sql).
// "기타" is the deliberate catch-all agreed on for v1 -- revisit this list
// once real usage data shows what people actually share.
export const CATEGORIES = ["맛집", "여행", "레시피", "쇼핑", "읽을거리", "기타"] as const;
export type Category = (typeof CATEGORIES)[number];
