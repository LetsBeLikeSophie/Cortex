import React, { useEffect, useRef } from 'react';
import { Animated, Dimensions, Modal, PanResponder, Pressable, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CloseIcon } from './Icons';

const { width, height } = Dimensions.get('window');
const MIN_SCALE = 1;
const MAX_SCALE = 4;
const DOUBLE_TAP_ZOOM = 2.2;
const DOUBLE_TAP_WINDOW_MS = 280;
const TAP_MOVE_THRESHOLD = 6;

function touchDistance(touches: { pageX: number; pageY: number }[]): number {
  const [a, b] = touches;
  return Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
}

// Hand-rolled instead of react-native-gesture-handler/reanimated (not
// otherwise a project dependency) -- PanResponder already gives raw
// multi-touch data, which is all real pinch-to-zoom needs. No pan-while-
// zoomed here (zoom always stays centered): that's the one simplification
// against a full gesture library, not pinch itself.
export function ImageViewer({ uri, onClose }: { uri: string | null; onClose: () => void }) {
  const scale = useRef(new Animated.Value(1)).current;
  const currentScale = useRef(1);
  const pinchStartDistance = useRef<number | null>(null);
  const pinchStartScale = useRef(1);
  const gestureWasPinch = useRef(false);
  const touchStart = useRef({ x: 0, y: 0 });
  const lastTapAt = useRef(0);
  const pendingSingleTap = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    scale.setValue(1);
    currentScale.current = 1;
    lastTapAt.current = 0;
    gestureWasPinch.current = false;
    if (pendingSingleTap.current) clearTimeout(pendingSingleTap.current);
  }, [uri, scale]);

  const setScale = (next: number, animated: boolean) => {
    const clamped = Math.max(MIN_SCALE, Math.min(MAX_SCALE, next));
    currentScale.current = clamped;
    if (animated) {
      Animated.spring(scale, { toValue: clamped, useNativeDriver: true, friction: 8 }).start();
    } else {
      scale.setValue(clamped);
    }
  };

  const toggleDoubleTapZoom = () => {
    setScale(currentScale.current > MIN_SCALE ? MIN_SCALE : DOUBLE_TAP_ZOOM, true);
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        const touches = evt.nativeEvent.touches;
        if (touches.length === 2) {
          gestureWasPinch.current = true;
          pinchStartDistance.current = touchDistance(touches);
          pinchStartScale.current = currentScale.current;
        } else {
          touchStart.current = { x: evt.nativeEvent.pageX, y: evt.nativeEvent.pageY };
        }
      },
      onPanResponderMove: (evt) => {
        const touches = evt.nativeEvent.touches;
        if (touches.length === 2) {
          if (!gestureWasPinch.current || pinchStartDistance.current === null) {
            gestureWasPinch.current = true;
            pinchStartDistance.current = touchDistance(touches);
            pinchStartScale.current = currentScale.current;
            return;
          }
          const dist = touchDistance(touches);
          setScale(pinchStartScale.current * (dist / pinchStartDistance.current), false);
        }
      },
      onPanResponderRelease: (evt) => {
        if (gestureWasPinch.current) {
          gestureWasPinch.current = false;
          pinchStartDistance.current = null;
          // Snap back to "fit" if the pinch let go close to it, instead of
          // leaving it at an almost-but-not-quite 1x scale.
          if (currentScale.current < MIN_SCALE + 0.15) setScale(MIN_SCALE, true);
          return;
        }

        const { pageX, pageY } = evt.nativeEvent;
        const moved = Math.hypot(pageX - touchStart.current.x, pageY - touchStart.current.y);
        if (moved > TAP_MOVE_THRESHOLD) return; // a drag, not a tap -- ignore

        const now = Date.now();
        if (now - lastTapAt.current < DOUBLE_TAP_WINDOW_MS) {
          // Second tap of a pair -- cancel the pending single-tap close and zoom instead.
          if (pendingSingleTap.current) clearTimeout(pendingSingleTap.current);
          lastTapAt.current = 0;
          toggleDoubleTapZoom();
          return;
        }

        // Possibly the first of a double-tap -- wait out the window before
        // treating it as a real single tap (closing on every tap would never
        // let a double-tap land).
        lastTapAt.current = now;
        pendingSingleTap.current = setTimeout(() => {
          if (Date.now() - lastTapAt.current >= DOUBLE_TAP_WINDOW_MS) onClose();
        }, DOUBLE_TAP_WINDOW_MS + 20);
      },
    })
  ).current;

  return (
    <Modal visible={!!uri} transparent animationType="fade" onRequestClose={onClose}>
      <SafeAreaView style={styles.backdrop} edges={['top', 'right']}>
        <Pressable onPress={onClose} style={styles.closeButton} hitSlop={12}>
          <CloseIcon size={18} color="#fff" strokeWidth={1.8} />
        </Pressable>
        <Animated.View style={styles.imageWrap} {...panResponder.panHandlers}>
          {uri && (
            <Animated.Image
              source={{ uri }}
              style={[styles.image, { transform: [{ scale }] }]}
              resizeMode="contain"
            />
          )}
        </Animated.View>
        <Text style={styles.hint}>손가락으로 확대/축소 · 탭하면 닫혀요</Text>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(10,10,10,0.95)' },
  closeButton: {
    alignSelf: 'flex-end',
    margin: 14,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  image: { width, height: height * 0.8 },
  hint: { textAlign: 'center', color: 'rgba(255,255,255,0.55)', fontSize: 12.5, marginBottom: 14, fontFamily: 'IBMPlexSansKR_400Regular' },
});
