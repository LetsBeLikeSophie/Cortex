import { useEffect, useState } from 'react';
import MediaLibrary from '../native/mediaLibrary';

export interface RecentScreenshot {
  id: string;
  uri: string;
}

// iOS and Android both localize the "Screenshots" smart album's display
// title to the device's language (e.g. "스크린샷" on a Korean-language
// device), so a plain English lookup silently finds nothing there -- try
// each known title before giving up.
const ALBUM_TITLES = ['Screenshots', '스크린샷'];

export interface RecentScreenshotsState {
  screenshots: RecentScreenshot[];
  // True once we've actually checked and the answer is no -- lets the save
  // sheet show *why* the quick-pick row is empty instead of just quietly
  // rendering nothing, which otherwise looks identical to "no screenshots
  // exist" and leaves no way to tell the two apart.
  permissionDenied: boolean;
}

// Native-only (no photo library on web) and read-only by design: never
// requests write access, and never asks for permission more than once --
// if the user said no, this never nags again every time the save sheet
// opens (see permissionDenied above for how that gets surfaced instead).
export function useRecentScreenshots(limit = 12): RecentScreenshotsState {
  const [screenshots, setScreenshots] = useState<RecentScreenshot[]>([]);
  const [permissionDenied, setPermissionDenied] = useState(false);

  useEffect(() => {
    if (!MediaLibrary) return;
    const lib = MediaLibrary;
    let cancelled = false;

    (async () => {
      let perm = await lib.getPermissionsAsync();
      if (!perm.granted && perm.canAskAgain) {
        perm = await lib.requestPermissionsAsync();
      }
      if (cancelled) return;
      if (!perm.granted) {
        setPermissionDenied(true);
        return;
      }

      let album: InstanceType<typeof lib.Album> | null = null;
      for (const title of ALBUM_TITLES) {
        album = await lib.Album.get(title).catch(() => null);
        if (album) break;
      }
      if (!album || cancelled) return;

      const assets = await new lib.Query()
        .album(album)
        .orderBy({ key: lib.AssetField.CREATION_TIME, ascending: false })
        .limit(limit)
        .exe()
        .catch(() => []);
      if (cancelled) return;

      const resolved = await Promise.all(
        assets.map(async (asset) => ({ id: asset.id, uri: await asset.getUri().catch(() => null) }))
      );
      if (!cancelled) {
        setScreenshots(resolved.filter((s): s is RecentScreenshot => !!s.uri));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [limit]);

  return { screenshots, permissionDenied };
}
