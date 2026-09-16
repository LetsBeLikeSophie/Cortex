import AsyncStorage from '@react-native-async-storage/async-storage';

// Must match backend/src/lib/categories.ts's CATEGORIES (the item_category
// enum in db/schema.sql) -- these are the only buckets a saved item can ever
// land in, so a "custom tab" just toggles one of these on/off rather than
// letting the user type an arbitrary label.
export const ALL_CATEGORIES = ['맛집', '여행', '레시피', '쇼핑', '읽을거리', '기타'] as const;
export type CategoryTab = (typeof ALL_CATEGORIES)[number];

const STORAGE_KEY = 'cortex:homeTabs';
const DEFAULT_TABS: CategoryTab[] = ['맛집', '여행', '레시피'];

function isCategoryTab(value: unknown): value is CategoryTab {
  return typeof value === 'string' && (ALL_CATEGORIES as readonly string[]).includes(value);
}

export async function loadHomeTabs(): Promise<CategoryTab[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_TABS;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isCategoryTab) : DEFAULT_TABS;
  } catch {
    return DEFAULT_TABS;
  }
}

export async function saveHomeTabs(tabs: CategoryTab[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(tabs));
  } catch {
    // Non-fatal -- worst case the customization doesn't stick this session.
  }
}
