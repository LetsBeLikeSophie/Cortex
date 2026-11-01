import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from '../auth/supabase';

// The fixed top-level classification every saved item gets (must match
// backend/src/lib/categories.ts's CATEGORIES / the item_category enum in
// db/schema.sql). Used for things keyed off that single classification --
// e.g. the stats screen's category breakdown -- separate from the home tab
// strip below, which pins arbitrary tags instead.
export const ALL_CATEGORIES = ['가볼 곳', '살 것', '배울 것', '볼 것', '기억할 것', '기타'] as const;

// Home tab strip: 즐겨찾기 (fixed, pinned items) plus any tag the user picks
// (freeform, one per saved item's auto-assigned or user-added tags) via a
// search-as-you-type list in TabPickerScreen -- tried auto-generating these
// from channel (source) instead, but a channel doesn't say anything about
// what an item actually *is*, so it made for weak "find this again" browsing
// compared to a tag someone chose themselves. A new account's seeded sample
// item carries '가이드' as one of its tags, so it's a reasonable single
// default rather than leaving the strip empty on first launch.
export type TagTab = string;

// Each account keeps its own tabs on this phone: tag names are its data, and
// coming back to the account brings them back. The old key held one list for
// the whole phone; the first account to read it takes it.
const LEGACY_KEY = 'cortex:homeTabs';
const keyFor = (userId: string) => `cortex:homeTabs:${userId}`;
const DEFAULT_TABS: TagTab[] = ['가이드'];

async function currentKey(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session ? keyFor(data.session.user.id) : null;
}

function parseTabs(raw: string): TagTab[] {
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : DEFAULT_TABS;
}

export async function loadHomeTabs(): Promise<TagTab[]> {
  try {
    const key = await currentKey();
    if (!key) return DEFAULT_TABS;
    const raw = await AsyncStorage.getItem(key);
    if (raw) return parseTabs(raw);
    const legacy = await AsyncStorage.getItem(LEGACY_KEY);
    if (!legacy) return DEFAULT_TABS;
    await AsyncStorage.setItem(key, legacy);
    await AsyncStorage.removeItem(LEGACY_KEY);
    return parseTabs(legacy);
  } catch {
    return DEFAULT_TABS;
  }
}

// A guest's memos moved to an account, so its tabs go with them.
export async function moveGuestTabs(guestId: string, userId: string): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(keyFor(guestId));
    if (!raw) return;
    const own = await AsyncStorage.getItem(keyFor(userId));
    const merged = [...new Set([...(own ? parseTabs(own) : []), ...parseTabs(raw)])];
    await AsyncStorage.setItem(keyFor(userId), JSON.stringify(merged));
    await AsyncStorage.removeItem(keyFor(guestId));
  } catch {
    // Non-fatal -- the account just starts from its own tabs.
  }
}

export async function saveHomeTabs(tabs: TagTab[]): Promise<void> {
  try {
    const key = await currentKey();
    if (key) await AsyncStorage.setItem(key, JSON.stringify(tabs));
  } catch {
    // Non-fatal -- worst case the customization doesn't stick this session.
  }
}
