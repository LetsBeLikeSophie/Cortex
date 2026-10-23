import type { ApiItem } from '../api/client';

export type TabParamList = {
  Home: undefined;
  Search: undefined;
};

export type RootStackParamList = {
  Tabs: undefined;
  // Both optional: present when this sheet was opened via the OS share
  // sheet (expo-share-intent) instead of the in-app "+" button.
  SaveSheet: { sharedText?: string; sharedUrl?: string; sharedNote?: string; sharedImageUri?: string; sharedImageUris?: string[]; returnToMehh?: boolean; mehhIds?: string[] } | undefined;
  ThemePicker: undefined;
  AiConsent: undefined;
  TabPicker: undefined;
  Stats: undefined;
  Profile: undefined;
  Trash: undefined;
  // composedFrom: just made by 모아서 만들기 -- the detail says from what
  // (shown once, on arrival; the sources aren't stored with the memo).
  ItemDetail: { item: ApiItem; composedFrom?: { tag: string; count: number; left?: number } };
  // Why it opened -- picks the headline; omitted = opened from the profile.
  Paywall: { reason?: 'classify' | 'search' | 'compose' } | undefined;
  // "모아서 만들기" for one home tag tab.
  // tag: what the memo is filed under; itemIds: picked materials instead of
  // the whole tag; tagChoices: let the sheet pick among the item's tags.
  Compose: { tag: string; count?: number; suggested?: import('../api/client').ComposeFormat; itemIds?: string[]; tagChoices?: string[] };
};
