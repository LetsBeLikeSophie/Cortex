import { useEffect, useRef } from 'react';
import { Animated, Keyboard, Platform } from 'react-native';

// The bottom sheets (ItemDetail, SaveSheet) are `position: absolute, bottom:
// 0` so their own `translateY` already carries the open/close slide
// animation -- KeyboardAvoidingView's padding-insertion approach fights that
// positioning. Translating the whole sheet up by the keyboard's own height
// instead works the same way on both platforms and composes cleanly with
// the existing transform.
export function useKeyboardOffset() {
  const offset = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const animateTo = (value: number, duration?: number) => {
      Animated.timing(offset, {
        toValue: value,
        // Android's keyboardDidShow/Hide events don't reliably report a
        // duration (often 0) -- fall back to something close to the sheet's
        // own 220ms open animation instead of snapping instantly.
        duration: duration && duration > 0 ? duration : 220,
        useNativeDriver: true,
      }).start();
    };

    const showSub = Keyboard.addListener(showEvent, (e) => animateTo(e.endCoordinates.height, e.duration));
    const hideSub = Keyboard.addListener(hideEvent, (e) => animateTo(0, e.duration));

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [offset]);

  return offset;
}
