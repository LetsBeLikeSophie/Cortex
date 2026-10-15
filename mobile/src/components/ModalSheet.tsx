import React, { useEffect, useRef } from 'react';
import { Animated, Dimensions, Easing, PanResponder, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { Theme, conceptOf } from '../theme/themes';
import { RuledLines } from './Decor';

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
  const concept = conceptOf(theme);
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

      {/* Each concept dresses the sheet its own way (see SHEET below):
          line = square top edge + ink rule, border = rounded + 1px outline,
          layer = a darker sheet peeking out behind (a sibling View, not a
          shadow -- same no-elevation stacking as the list cards), vintage =
          a ruled index card with an accent band and a punch hole for a handle. */}
      <Animated.View style={[styles.sheetWrap, { transform: [{ translateY }] }]}>
        {concept === 'layer' && (
          <View
            pointerEvents="none"
            style={[styles.backSheet, { backgroundColor: theme.cardStack, borderTopLeftRadius: SHEET[concept].radius, borderTopRightRadius: SHEET[concept].radius }]}
          />
        )}
        <View
          style={[
            styles.sheet,
            {
              paddingHorizontal,
              backgroundColor: SHEET[concept].bg(theme),
              borderTopLeftRadius: SHEET[concept].radius,
              borderTopRightRadius: SHEET[concept].radius,
              paddingBottom: paddingBottom + insets.bottom,
              ...(maxHeightRatio !== undefined ? { maxHeight: SHEET_TRAVEL * maxHeightRatio } : null),
              ...SHEET[concept].edge(theme, bordered),
            },
          ]}
        >
          {concept === 'vintage' && <RuledLines theme={theme} top={72} />}
          <View style={[styles.grabberHitArea, { marginBottom: grabberMarginBottom }]} {...panResponder.panHandlers}>
            {concept === 'vintage' ? (
              <View style={[styles.punchHole, { backgroundColor: theme.bg, borderColor: theme.line }]} />
            ) : (
              <View style={[styles.grabber, SHEET[concept].grabber(theme)]} />
            )}
          </View>
          {children}
        </View>
      </Animated.View>
    </View>
  );
}

const SHEET: Record<
  ReturnType<typeof conceptOf>,
  {
    radius: number;
    bg: (t: Theme) => string;
    edge: (t: Theme, bordered: boolean) => object;
    grabber: (t: Theme) => object;
  }
> = {
  line: {
    radius: 0,
    bg: (t) => t.bg,
    edge: (t) => ({ borderTopWidth: 1, borderColor: t.ink }),
    grabber: (t) => ({ width: 22, height: 1.5, borderRadius: 0, backgroundColor: t.ink }),
  },
  border: {
    radius: 24,
    bg: (t) => t.surface,
    edge: (t) => ({ borderTopWidth: 1, borderLeftWidth: 1, borderRightWidth: 1, borderColor: t.line, ...SHADOW }),
    grabber: (t) => ({ backgroundColor: t.line }),
  },
  layer: {
    radius: 22,
    bg: (t) => t.cardBg,
    edge: () => ({}),
    grabber: (t) => ({ backgroundColor: t.cardStack }),
  },
  vintage: {
    radius: 6,
    bg: (t) => t.cardBg,
    edge: (t) => ({ borderTopWidth: 3, borderColor: t.accent, overflow: 'hidden' }),
    grabber: () => ({}),
  },
};

const SHADOW = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: -6 },
  shadowOpacity: 0.12,
  shadowRadius: 24,
  elevation: 16,
};

const styles = StyleSheet.create({
  sheetWrap: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  sheet: { paddingTop: 20 },
  backSheet: { position: 'absolute', top: -8, left: 14, right: -14, height: 80 },
  punchHole: { width: 12, height: 12, borderRadius: 6, borderWidth: 1 },
  grabberHitArea: { alignSelf: 'stretch', alignItems: 'center', paddingVertical: 10, marginTop: -10 },
  grabber: { width: 40, height: 4, borderRadius: 2 },
});
