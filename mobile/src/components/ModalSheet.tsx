import React, { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Easing, Keyboard, PanResponder, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { OUTLINE, Theme, allEdges, conceptOf } from '../theme/themes';
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
  liftForKeyboard = false,
  keyboardOverflow = 0,
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
  // Sit the whole sheet on top of the keyboard and cap it to the space left
  // above it, so content that shrinks (TabPicker's tag list) stays visible.
  // The sheet lives in its own Dialog window on Android, which the OS never
  // resizes for the keyboard, so a KeyboardAvoidingView inside it can't
  // reliably do this (on a Z Flip it left one row showing).
  liftForKeyboard?: boolean;
  // How much of the sheet's top may slide off-screen when lifted, instead of
  // shrinking the content. TabPicker passes its heading block's height, so
  // the whole sheet rides up with the keyboard and the tag list keeps its
  // size -- only the title/description go out of view, never the search box.
  keyboardOverflow?: number;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const concept = conceptOf(theme);
  const translateY = useRef(new Animated.Value(animated ? SHEET_TRAVEL : 0)).current;
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    if (!liftForKeyboard) return;
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, (e) => setKeyboardHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, [liftForKeyboard]);

  const lifted = liftForKeyboard && keyboardHeight > 0;
  // Android reports the keyboard height minus the navigation bar, but this
  // sheet's bottom edge sits at the very bottom of the screen (behind that
  // bar) -- without adding it back the sheet stopped short and the keyboard
  // still covered its bottom row (the detail sheet's 닫기 button).
  const keyboardLift = keyboardHeight + (Platform.OS === 'android' ? insets.bottom : 0);

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
          line = square top edge + light rule, border = rounded + 1px outline,
          layer = the cards' paper tone (its stacked "back sheet" depth only
          ever sits bottom-right, on cards and the primary button -- never
          above the sheet's top edge), vintage =
          a ruled index card with an accent band and a punch hole for a handle. */}
      <Animated.View style={[styles.sheetWrap, lifted && { bottom: keyboardLift }, { transform: [{ translateY }] }]}>
        <View
          style={[
            styles.sheet,
            {
              paddingHorizontal,
              backgroundColor: SHEET[concept].bg(theme),
              borderTopLeftRadius: SHEET[concept].radius,
              borderTopRightRadius: SHEET[concept].radius,
              // Above the keyboard the home-indicator inset is covered anyway.
              paddingBottom: lifted ? 12 : paddingBottom + insets.bottom,
              ...(maxHeightRatio !== undefined ? { maxHeight: SHEET_TRAVEL * maxHeightRatio } : null),
              ...(lifted
                ? { maxHeight: Math.min(SHEET_TRAVEL * (maxHeightRatio ?? 1), SHEET_TRAVEL - keyboardLift - insets.top - 16 + keyboardOverflow) }
                : null),
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
    // Same light rule as the home screen's dividers -- an ink line here
    // read as heavier than anything else in the line theme.
    edge: (t) => ({ ...allEdges(0, 'transparent'), borderTopWidth: OUTLINE, borderTopColor: t.line }),
    grabber: (t) => ({ width: 28, height: 2, borderRadius: 0, backgroundColor: t.line }),
  },
  border: {
    radius: 24,
    bg: (t) => t.surface,
    edge: (t) => ({ ...allEdges(OUTLINE, t.line), borderBottomWidth: 0, ...SHADOW }),
    grabber: (t) => ({ backgroundColor: t.line }),
  },
  layer: {
    radius: 22,
    bg: (t) => t.cardBg,
    edge: () => allEdges(0, 'transparent'),
    grabber: (t) => ({ backgroundColor: t.cardStack }),
  },
  vintage: {
    radius: 6,
    bg: (t) => t.cardBg,
    edge: (t) => ({ ...allEdges(0, 'transparent'), borderTopWidth: 3, borderTopColor: t.accent, overflow: 'hidden' }),
    grabber: () => ({}),
  },
};

// What a sheet is painted with, for a popup that should look like one.
export const sheetBackground = (theme: Theme) => SHEET[conceptOf(theme)].bg(theme);

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
  punchHole: { width: 12, height: 12, borderRadius: 6, borderWidth: 1 },
  grabberHitArea: { alignSelf: 'stretch', alignItems: 'center', paddingVertical: 10, marginTop: -10 },
  grabber: { width: 40, height: 4, borderRadius: 2 },
});
