import type { ApiItem } from '../api/client';

export type TabParamList = {
  Home: undefined;
  Search: undefined;
};

export type RootStackParamList = {
  Tabs: undefined;
  // Both optional: present when this sheet was opened via the OS share
  // sheet (expo-share-intent) instead of the in-app "+" button.
  SaveSheet: { sharedText?: string; sharedUrl?: string; sharedImageUri?: string; sharedImageUris?: string[] } | undefined;
  ThemePicker: undefined;
  TabPicker: undefined;
  Stats: undefined;
  Profile: undefined;
  Trash: undefined;
  ItemDetail: { item: ApiItem };
  // Why it opened -- picks the headline; omitted = opened from the profile.
  Paywall: { reason?: 'classify' | 'search' | 'compose' } | undefined;
  // "모아서 만들기" for one home tag tab.
  Compose: { tag: string; count: number; suggested?: import('../api/client').ComposeFormat };
};
