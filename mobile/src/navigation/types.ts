import type { ApiItem } from '../api/client';

export type TabParamList = {
  Home: undefined;
  Search: undefined;
};

export type RootStackParamList = {
  Tabs: undefined;
  // Both optional: present when this sheet was opened via the OS share
  // sheet (expo-share-intent) instead of the in-app "+" button.
  SaveSheet: { sharedText?: string; sharedUrl?: string; sharedImageUri?: string } | undefined;
  ThemePicker: undefined;
  Stats: undefined;
  Profile: undefined;
  Trash: undefined;
  ItemDetail: { item: ApiItem };
};
