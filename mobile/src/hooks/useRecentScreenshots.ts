import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { Album, AssetField, Query, getPermissionsAsync, requestPermissionsAsync } from 'expo-media-library';

export interface RecentScreenshot {
  id: string;
  uri: string;
}

// iOS and Android both localize the "Screenshots" smart album's display
// title to the device's language (e.g. "스크린샷" on a Korean-language
// device), so a plain English lookup silently finds nothing there -- try
// each known title before giving up.
const ALBUM_TITLES = ['Screenshots', '스크린샷'];

// Native-only (no photo library on web) and read-only by design: never
// requests write access, and never asks for permission more than once --
// if the user said no, this just quietly renders nothing rather than
// nagging every time the save sheet opens.
export function useRecentScreenshots(limit = 12) {
  const [screenshots, setScreenshots] = useState<RecentScreenshot[]>([]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    let cancelled = false;

    (async () => {
      let perm = await getPermissionsAsync();
      if (!perm.granted && perm.canAskAgain) {
        perm = await requestPermissionsAsync();
      }
      if (!perm.granted || cancelled) return;

      let album: Album | null = null;
      for (const title of ALBUM_TITLES) {
        album = await Album.get(title).catch(() => null);
        if (album) break;
      }
      if (!album || cancelled) return;

      const assets = await new Query()
        .album(album)
        .orderBy({ key: AssetField.CREATION_TIME, ascending: false })
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

  return screenshots;
}
