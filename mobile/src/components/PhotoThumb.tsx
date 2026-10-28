import React, { useEffect, useState } from 'react';
import { Image, View } from 'react-native';
import type { Theme } from '../theme/themes';
import { getScreenshotUrl } from '../api/client';

// A small preview of a saved photo for list rows where the title can't tell
// photos apart -- 미분류 photos all read '정리 대기 · 사진', and the trash
// (decision C1, B). The signed URL is fetched when the row shows (cached
// per item in getScreenshotUrl); until then, or if it fails, a plain tile.
export function PhotoThumb({ itemId, theme, size = 44 }: { itemId: string; theme: Theme; size?: number }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    getScreenshotUrl(itemId)
      .then((res) => {
        if (!cancelled) setUrl(res.url);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [itemId]);
  return (
    <View style={{ width: size, height: size, borderRadius: theme.pickRadius, backgroundColor: theme.soft, overflow: 'hidden' }}>
      {url && <Image source={{ uri: url }} style={{ width: size, height: size }} resizeMode="cover" accessibilityIgnoresInvertColors />}
    </View>
  );
}
