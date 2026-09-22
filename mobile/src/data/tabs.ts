// The fixed top-level classification every saved item gets (must match
// backend/src/lib/categories.ts's CATEGORIES / the item_category enum in
// db/schema.sql). Used for things keyed off that single classification --
// e.g. the stats screen's category breakdown.
export const ALL_CATEGORIES = ['맛집', '여행', '레시피', '쇼핑', '읽을거리', '기타'] as const;
