import type { ApiItem } from '../api/client';

export type TabParamList = {
  Home: undefined;
  Search: undefined;
};

export type RootStackParamList = {
  Tabs: undefined;
  // Both optional: present when this sheet was opened via the OS share
  // sheet (expo-share-intent) instead of the in-app "+" button.
  SaveSheet: { sharedText?: string; sharedUrl?: string; sharedNote?: string; sharedImageUri?: string; sharedImageUris?: string[] } | undefined;
  ThemePicker: undefined;
  AiConsent: undefined;
  TabPicker: undefined;
  Stats: undefined;
  Profile: undefined;
  Trash: undefined;
  // composedFrom: just made by 모아서 만들기 -- the detail says from what
  // (shown once, on arrival; the sources aren't stored with the memo).
  // remadeFrom: what a 다른 모양으로 다시 just replaced -- offered as an undo.
  ItemDetail: { item: ApiItem; composedFrom?: { tag: string; count: number; left?: number; freeRemake?: boolean }; remadeFrom?: { title: string; rawText: string } };
  // Why it opened -- picks the headline; omitted = opened from the profile.
  Paywall: { reason?: 'classify' | 'search' | 'compose' | 'tag_cleanup' } | undefined;
  // Memo-lock PIN pad: 'check' opens a locked memo, 'set' makes a new PIN.
  Pin: { mode: 'set' | 'check' };
  // 태그 정리하기, from tag settings.
  TagCleanup: undefined;
  // "모아서 만들기" for one home tag tab.
  // tag: what the memo is filed under; itemIds: picked materials instead of
  // the whole tag; tagChoices: let the sheet pick among the item's tags.
  Compose: {
    tag: string;
    // Usable materials (composeMaterials); lockedOut = locked memos left out.
    count?: number;
    lockedOut?: number;
    suggested?: import('../api/client').ComposeFormat;
    itemIds?: string[];
    tagChoices?: string[];
    // Remake this composed memo in place; freeRemake = the first remake is free.
    retryOf?: string;
    freeRemake?: boolean;
    // The memo as it is right before a remake (edited = changed by hand in
    // the detail just now) -- the sheet warns, and the result offers undo.
    remakeBefore?: { title: string; rawText: string; edited: boolean };
  };
};
