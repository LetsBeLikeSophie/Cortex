import AsyncStorage from '@react-native-async-storage/async-storage';

// The fixed top-level classification every saved item gets (must match
// backend/src/lib/categories.ts's CATEGORIES / the item_category enum in
// db/schema.sql). Still used for things keyed off that single classification
// -- e.g. the stats screen's category breakdown -- separate from the home
// tab strip below, which now pins arbitrary tags instead.
export const ALL_CATEGORIES = ['맛집', '여행', '레시피', '쇼핑', '읽을거리', '기타'] as const;

// Home tab strip: pins any tag (freeform, one per saved item's auto-assigned
// tags array) rather than one of the fixed categories above -- picked via a
// search-as-you-type list in TabPickerScreen. A new account's seeded sample
// item carries '맛집' as one of its tags, so it's a reasonable single
// default rather than leaving the strip empty on first launch.
export type TagTab = string;

const STORAGE_KEY = 'cortex:homeTabs';
const DEFAULT_TABS: TagTab[] = ['맛집'];

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
