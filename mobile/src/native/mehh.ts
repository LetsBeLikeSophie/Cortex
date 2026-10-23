import { Linking } from 'react-native';

// Mehh (Sophie's screenshot-cleanup app) shares screenshots here with this
// URL as the share text, optionally with ?ids= -- the MediaStore ids of the
// shared images, in the same order. Opening it back with what was saved is
// Mehh's go-ahead to move those originals to the trash, so it's only called
// for images that are safely saved.
export const MEHH_SAVED_URL = 'mehh://cortex-saved';

// null: not a Mehh share. ids: undefined for an older Mehh that sends none.
export function parseMehhMarker(text: string | null | undefined): { ids?: string[] } | null {
  const marker = text?.trim();
  if (!marker?.startsWith(MEHH_SAVED_URL)) return null;
  const raw = /[?&]ids=([^&#\s]*)/.exec(marker)?.[1];
  const ids = raw ? decodeURIComponent(raw).split(',').map((id) => id.trim()).filter(Boolean) : [];
  return { ids: ids.length > 0 ? ids : undefined };
}

// ids: the saved images' Mehh ids -- left off when they couldn't be matched
// up, and Mehh falls back to the count alone.
export function tellMehhSaved(count: number, ids?: string[]) {
  const query = ids?.length ? `count=${count}&ids=${ids.map(encodeURIComponent).join(',')}` : `count=${count}`;
  Linking.openURL(`${MEHH_SAVED_URL}?${query}`).catch(() => {});
}
