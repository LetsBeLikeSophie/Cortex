import type { ApiItem } from '../api/client';

export type TabParamList = {
  Home: undefined;
  // Search lives inside HomeScreen itself now (a persistent search box, no
  // separate screen) -- this is the "내 저장 습관 보기" tab instead.
  Stats: undefined;
};

export type RootStackParamList = {
  Tabs: undefined;
  // Both optional: present when this sheet was opened via the OS share
  // sheet (expo-share-intent) instead of the in-app "+" button.
  SaveSheet: { sharedText?: string; sharedUrl?: string; sharedImageUri?: string } | undefined;
  ThemePicker: undefined;
  TabPicker: undefined;
  Profile: undefined;
  Trash: undefined;
  ItemDetail: { item: ApiItem };
};
