import { useCallback, useEffect, useRef, useState } from 'react';
import MediaLibrary from '../native/mediaLibrary';

export interface RecentScreenshot {
  id: string;
  uri: string;
  // Already-read image data, when the picker handed it over (the "앨범에서
  // 선택" multi-pick path). Bulk save uses it as-is instead of re-reading
  // the file -- re-reading via expo-file-system doesn't work on web.
  base64?: string;
}

// iOS and Android both localize the "Screenshots" smart album's display
// title to the device's language (e.g. "스크린샷" on a Korean-language
// device), so a plain English lookup silently finds nothing there -- try
// each known title before giving up.
const ALBUM_TITLES = ['Screenshots', '스크린샷'];

export interface RecentScreenshotsState {
  screenshots: RecentScreenshot[];
  // Photo access hasn't been granted yet but can still be asked for -- the
  // save sheet shows a "최근 스크린샷 불러오기" row that calls requestAccess,
  // instead of a system prompt popping up the moment the sheet opens (on a
  // first-time user's very first tap of 추가, before they've decided to add
  // a photo at all).
  needsPermission: boolean;
  // Asked and refused for good (Android won't show the prompt again) -- the
  // sheet points to Settings instead of rendering nothing, which would look
  // identical to "no screenshots exist".
  permissionDenied: boolean;
  requestAccess: () => void;
}

// Native-only (no photo library on web) and read-only by design: never
// requests write access, and only asks when the person taps to load.
export function useRecentScreenshots(limit = 12): RecentScreenshotsState {
  const [screenshots, setScreenshots] = useState<RecentScreenshot[]>([]);
  const [needsPermission, setNeedsPermission] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const cancelledRef = useRef(false);

  const load = useCallback(
    async (ask: boolean) => {
      if (!MediaLibrary) return;
      const lib = MediaLibrary;
      let perm = await lib.getPermissionsAsync();
      if (!perm.granted && perm.canAskAgain && ask) {
        perm = await lib.requestPermissionsAsync();
      }
      if (cancelledRef.current) return;
      setNeedsPermission(!perm.granted && perm.canAskAgain);
      setPermissionDenied(!perm.granted && !perm.canAskAgain);
      if (!perm.granted) return;

      let album: InstanceType<typeof lib.Album> | null = null;
      for (const title of ALBUM_TITLES) {
        album = await lib.Album.get(title).catch(() => null);
        if (album) break;
      }
      if (!album || cancelledRef.current) return;

      const assets = await new lib.Query()
        .album(album)
        .orderBy({ key: lib.AssetField.CREATION_TIME, ascending: false })
        .limit(limit)
        .exe()
        .catch(() => []);
      if (cancelledRef.current) return;

      const resolved = await Promise.all(
        assets.map(async (asset) => ({ id: asset.id, uri: await asset.getUri().catch(() => null) }))
      );
      if (!cancelledRef.current) {
        setScreenshots(resolved.filter((s): s is RecentScreenshot => !!s.uri));
      }
    },
    [limit]
  );

  // On open: only look (no prompt) -- loads right away once access exists.
  useEffect(() => {
    cancelledRef.current = false;
    load(false);
    return () => {
      cancelledRef.current = true;
    };
  }, [load]);

  return { screenshots, needsPermission, permissionDenied, requestAccess: () => load(true) };
}
