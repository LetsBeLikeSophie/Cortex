import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Directory, File, Paths } from 'expo-file-system';
import MediaLibrary from '../native/mediaLibrary';
import { permissionToast, showToast } from '../native/toast';
import { CloseIcon, DownloadIcon } from './Icons';

const { width, height } = Dimensions.get('window');
const IMAGE_W = width;
const IMAGE_H = height * 0.8;
const MIN_SCALE = 1;
const MAX_SCALE = 4;
const DOUBLE_TAP_ZOOM = 2.2;
const DOUBLE_TAP_WINDOW_MS = 280;
const TAP_MOVE_THRESHOLD = 6;

type Touch = { pageX: number; pageY: number };

const distance = (a: Touch, b: Touch) => Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
const midpoint = (a: Touch, b: Touch) => ({ x: (a.pageX + b.pageX) / 2, y: (a.pageY + b.pageY) / 2 });
const clampScale = (s: number) => Math.max(MIN_SCALE, Math.min(MAX_SCALE, s));

// How far the image may be dragged at a given scale before its edge would
// pull away from the frame -- zero at 1x, so an unzoomed image stays put.
function clampOffset(x: number, y: number, s: number) {
  const maxX = (IMAGE_W * (s - 1)) / 2;
  const maxY = (IMAGE_H * (s - 1)) / 2;
  return { x: Math.max(-maxX, Math.min(maxX, x)), y: Math.max(-maxY, Math.min(maxY, y)) };
}

// Hand-rolled instead of react-native-gesture-handler/reanimated (not
// otherwise a project dependency) -- PanResponder already gives raw
// multi-touch data. Transform is translate-then-scale around the frame's
// center, so a content point p (from the center, unscaled) lands at
// center + offset + scale * p. Pinch keeps the point under the fingers'
// midpoint fixed (zooming *into* where you pinch, not the middle), one
// finger drags while zoomed, double tap zooms into the tapped spot.
export function ImageViewer({ uri, onClose }: { uri: string | null; onClose: () => void }) {
  const scale = useRef(new Animated.Value(1)).current;
  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const cur = useRef({ s: 1, x: 0, y: 0 });
  const center = useRef({ x: width / 2, y: height / 2 });
  const frameRef = useRef<View>(null);

  // Gesture bookkeeping: what kind of gesture is in progress and where it
  // started, so the 1 <-> 2 finger handoff mid-gesture restarts cleanly.
  const mode = useRef<'none' | 'pan' | 'pinch'>('none');
  const start = useRef({ s: 1, x: 0, y: 0, dist: 1, fx: 0, fy: 0, px: 0, py: 0 });
  const wasMulti = useRef(false);
  const touchStart = useRef({ x: 0, y: 0 });
  const lastTapAt = useRef(0);
  const pendingSingleTap = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saving, setSaving] = useState(false);

  const apply = (s: number, x: number, y: number, animated: boolean) => {
    const o = clampOffset(x, y, s);
    cur.current = { s, x: o.x, y: o.y };
    if (animated) {
      Animated.parallel([
        Animated.spring(scale, { toValue: s, useNativeDriver: true, friction: 8 }),
        Animated.spring(pan, { toValue: { x: o.x, y: o.y }, useNativeDriver: true, friction: 8 }),
      ]).start();
    } else {
      scale.setValue(s);
      pan.setValue({ x: o.x, y: o.y });
    }
  };

  useEffect(() => {
    apply(1, 0, 0, false);
    lastTapAt.current = 0;
    mode.current = 'none';
    if (pendingSingleTap.current) clearTimeout(pendingSingleTap.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uri]);

  // Offset that keeps content under focal point F0 (at scale s0, offset o0)
  // under focal point F at scale s.
  const offsetFor = (s: number, fx: number, fy: number) => {
    const st = start.current;
    const c = center.current;
    return {
      x: fx - c.x - (s * (st.fx - c.x - st.x)) / st.s,
      y: fy - c.y - (s * (st.fy - c.y - st.y)) / st.s,
    };
  };

  const beginPinch = (a: Touch, b: Touch) => {
    const m = midpoint(a, b);
    mode.current = 'pinch';
    wasMulti.current = true;
    start.current = { ...start.current, s: cur.current.s, x: cur.current.x, y: cur.current.y, dist: distance(a, b), fx: m.x, fy: m.y };
  };

  const beginPan = (t: Touch) => {
    mode.current = 'pan';
    start.current = { ...start.current, x: cur.current.x, y: cur.current.y, px: t.pageX, py: t.pageY };
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        const touches = evt.nativeEvent.touches as Touch[];
        wasMulti.current = false;
        touchStart.current = { x: evt.nativeEvent.pageX, y: evt.nativeEvent.pageY };
        if (touches.length >= 2) beginPinch(touches[0], touches[1]);
        else beginPan(evt.nativeEvent);
      },
      onPanResponderMove: (evt) => {
        const touches = evt.nativeEvent.touches as Touch[];
        if (touches.length >= 2) {
          if (mode.current !== 'pinch') return beginPinch(touches[0], touches[1]);
          const s = clampScale((start.current.s * distance(touches[0], touches[1])) / start.current.dist);
          const m = midpoint(touches[0], touches[1]);
          const o = offsetFor(s, m.x, m.y);
          apply(s, o.x, o.y, false);
        } else if (touches.length === 1) {
          // A finger lifted mid-pinch: carry on as a drag from here.
          if (mode.current !== 'pan') return beginPan(touches[0]);
          if (cur.current.s <= MIN_SCALE) return;
          apply(
            cur.current.s,
            start.current.x + touches[0].pageX - start.current.px,
            start.current.y + touches[0].pageY - start.current.py,
            false
          );
        }
      },
      onPanResponderRelease: (evt) => {
        mode.current = 'none';
        if (wasMulti.current) {
          // Snap back to "fit" when a pinch lets go close to it.
          if (cur.current.s < MIN_SCALE + 0.15) apply(MIN_SCALE, 0, 0, true);
          return;
        }

        const { pageX, pageY } = evt.nativeEvent;
        const moved = Math.hypot(pageX - touchStart.current.x, pageY - touchStart.current.y);
        if (moved > TAP_MOVE_THRESHOLD) return; // a drag, not a tap

        const now = Date.now();
        if (now - lastTapAt.current < DOUBLE_TAP_WINDOW_MS) {
          if (pendingSingleTap.current) clearTimeout(pendingSingleTap.current);
          lastTapAt.current = 0;
          if (cur.current.s > MIN_SCALE) {
            apply(MIN_SCALE, 0, 0, true);
          } else {
            // Zoom into the tapped spot: keep it where the finger is.
            const c = center.current;
            apply(DOUBLE_TAP_ZOOM, (1 - DOUBLE_TAP_ZOOM) * (pageX - c.x), (1 - DOUBLE_TAP_ZOOM) * (pageY - c.y), true);
          }
          return;
        }

        // Possibly the first of a double tap -- wait out the window before
        // treating it as a real single tap (which closes the viewer).
        lastTapAt.current = now;
        pendingSingleTap.current = setTimeout(() => {
          if (Date.now() - lastTapAt.current >= DOUBLE_TAP_WINDOW_MS) onClose();
        }, DOUBLE_TAP_WINDOW_MS + 20);
      },
    })
  ).current;

  // The stored image only lives on the server (a signed URL), so "save"
  // means download to cache, then hand that file to the photo library.
  // Write-only permission: saving never needs to read the user's photos.
  const saveToAlbum = async () => {
    if (!uri || !MediaLibrary || saving) return;
    setSaving(true);
    try {
      const perm = await MediaLibrary.requestPermissionsAsync(true, ['photo']);
      if (!perm.granted) {
        permissionToast('사진 저장', perm.canAskAgain);
        return;
      }
      const dir = new Directory(Paths.cache, 'viewer');
      if (!dir.exists) dir.create();
      const file = await File.downloadFileAsync(uri, dir, { idempotent: true });
      await MediaLibrary.Asset.create(file.uri);
      showToast('앨범에 저장했어요');
    } catch {
      showToast('저장하지 못했어요. 잠시 후 다시 시도해 주세요');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={!!uri} transparent animationType="fade" onRequestClose={onClose}>
      <SafeAreaView style={styles.backdrop} edges={['top', 'right']}>
        <View style={styles.topBar}>
          {Platform.OS !== 'web' && MediaLibrary ? (
            <Pressable onPress={saveToAlbum} style={styles.saveButton} hitSlop={8} disabled={saving}>
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <DownloadIcon size={16} color="#fff" strokeWidth={1.6} />
              )}
              <Text style={styles.saveText}>앨범에 저장</Text>
            </Pressable>
          ) : (
            <View />
          )}
          <Pressable onPress={onClose} style={styles.closeButton} hitSlop={12}>
            <CloseIcon size={18} color="#fff" strokeWidth={1.8} />
          </Pressable>
        </View>
        <View
          ref={frameRef}
          style={styles.imageWrap}
          onLayout={() =>
            frameRef.current?.measureInWindow((x, y, w, h) => {
              center.current = { x: x + w / 2, y: y + h / 2 };
            })
          }
          {...panResponder.panHandlers}
        >
          {uri && (
            <Animated.Image
              source={{ uri }}
              style={[
                styles.image,
                { transform: [{ translateX: pan.x }, { translateY: pan.y }, { scale }] },
              ]}
              resizeMode="contain"
            />
          )}
        </View>
        <Text style={styles.hint}>두 손가락으로 확대 · 확대하면 끌어서 이동 · 탭하면 닫혀요</Text>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(10,10,10,0.95)' },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', margin: 14 },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  saveText: { color: '#fff', fontSize: 13, fontFamily: 'IBMPlexSansKR_500Medium' },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  image: { width: IMAGE_W, height: IMAGE_H },
  hint: { textAlign: 'center', color: 'rgba(255,255,255,0.55)', fontSize: 12.5, marginBottom: 14, fontFamily: 'IBMPlexSansKR_400Regular' },
});
