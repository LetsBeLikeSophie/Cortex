import React, { useEffect, useRef } from 'react';
import { Animated, Dimensions, Easing, PanResponder, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { Theme } from '../theme/themes';

const SHEET_TRAVEL = Dimensions.get('window').height;

// The backdrop (tap-to-dismiss blur) + sliding sheet + grabber that
// SaveSheet, ItemDetail, TabPicker, and ThemePicker were each hand-building
// -- only a handful of numbers actually differed screen to screen (how much
// bottom padding, how tall it's allowed to grow, whether it slides in).
// A full-content sheet (SaveSheet/ItemDetail) wants the slide-in and a
// dark-mode top border; a picker sheet (TabPicker/ThemePicker) is shorter,
// unanimated, and grows to fit its content instead of capping at a ratio of
// screen height.
export function ModalSheet({
  theme,
  onClose,
  animated = true,
  bordered = true,
  paddingBottom = 32,
  maxHeightRatio,
  paddingHorizontal = 24,
  grabberMarginBottom = 24,
  children,
}: {
  theme: Theme;
  onClose: () => void;
  animated?: boolean;
  bordered?: boolean;
  paddingBottom?: number;
  maxHeightRatio?: number;
  paddingHorizontal?: number;
  grabberMarginBottom?: number;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const card = theme.list === 'card';
  const translateY = useRef(new Animated.Value(animated ? SHEET_TRAVEL : 0)).current;

  useEffect(() => {
    if (!animated) return;
    Animated.timing(translateY, {
      toValue: 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [animated, translateY]);

  // Drag the grabber down to dismiss -- it only ever looked draggable
  // before (a static bar), nothing actually responded to touch. Scoped to
  // the grabber's own hit area rather than the whole sheet so it doesn't
  // fight an inner ScrollView's own vertical pan (SaveSheet/ItemDetail both
  // scroll their content).
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_evt, gesture) => Math.abs(gesture.dy) > 4,
      onPanResponderMove: (_evt, gesture) => {
        if (gesture.dy > 0) translateY.setValue(gesture.dy);
      },
      onPanResponderRelease: (_evt, gesture) => {
        const pastThreshold = gesture.dy > 100 || gesture.vy > 0.8;
        if (pastThreshold) {
          Animated.timing(translateY, {
            toValue: SHEET_TRAVEL,
            duration: 200,
            easing: Easing.in(Easing.cubic),
            useNativeDriver: true,
          }).start(onClose);
        } else {
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true, friction: 8 }).start();
        }
      },
    })
  ).current;

  return (
    <View style={StyleSheet.absoluteFill}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose}>
        <BlurView
          intensity={18}
          tint={theme.dark ? 'dark' : 'light'}
          style={[StyleSheet.absoluteFill, { backgroundColor: theme.dark ? 'rgba(4,5,7,0.5)' : 'rgba(20,20,15,0.28)' }]}
        />
      </Pressable>

      <Animated.View
        style={[
          styles.sheet,
          {
            paddingHorizontal,
            backgroundColor: theme.bg,
            borderTopWidth: bordered && theme.dark ? 1 : 0,
            borderColor: theme.line,
            borderTopLeftRadius: card ? 30 : 26,
            borderTopRightRadius: card ? 30 : 26,
            paddingBottom: paddingBottom + insets.bottom,
            ...(maxHeightRatio !== undefined ? { maxHeight: SHEET_TRAVEL * maxHeightRatio } : null),
            transform: [{ translateY }],
            shadowOpacity: theme.dark ? 0.45 : 0.14,
          },
        ]}
      >
        <View style={[styles.grabberHitArea, { marginBottom: grabberMarginBottom }]} {...panResponder.panHandlers}>
          <View style={[styles.grabber, { backgroundColor: theme.sub }]} />
        </View>
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowRadius: 24,
    elevation: 16,
  },
  grabberHitArea: { alignSelf: 'stretch', alignItems: 'center', paddingVertical: 10, marginTop: -10 },
  grabber: { width: 40, height: 4, borderRadius: 2 },
});
