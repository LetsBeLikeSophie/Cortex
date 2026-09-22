import AsyncStorage from '@react-native-async-storage/async-storage';

// The fixed top-level classification every saved item gets (must match
// backend/src/lib/categories.ts's CATEGORIES / the item_category enum in
// db/schema.sql). Used for things keyed off that single classification --
// e.g. the stats screen's category breakdown -- separate from the home tab
// strip below, which pins arbitrary tags instead.
export const ALL_CATEGORIES = ['맛집', '여행', '레시피', '쇼핑', '읽을거리', '기타'] as const;

// Home tab strip: 즐겨찾기 (fixed, pinned items) plus any tag the user picks
// (freeform, one per saved item's auto-assigned or user-added tags) via a
// search-as-you-type list in TabPickerScreen -- tried auto-generating these
// from channel (source) instead, but a channel doesn't say anything about
// what an item actually *is*, so it made for weak "find this again" browsing
// compared to a tag someone chose themselves. A new account's seeded sample
// item carries '가이드' as one of its tags, so it's a reasonable single
// default rather than leaving the strip empty on first launch.
export type TagTab = string;

const STORAGE_KEY = 'cortex:homeTabs';
const DEFAULT_TABS: TagTab[] = ['가이드'];

export async function loadHomeTabs(): Promise<TagTab[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_TABS;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : DEFAULT_TABS;
  } catch {
    return DEFAULT_TABS;
  }
}

export async function saveHomeTabs(tabs: TagTab[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(tabs));
  } catch {
    // Non-fatal -- worst case the customization doesn't stick this session.
  }
}
