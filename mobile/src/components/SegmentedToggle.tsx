import React, { useEffect, useRef, useState } from 'react';
import { Animated, LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import { Theme } from '../theme/themes';

export interface SegmentOption<K extends string> {
  key: K;
  label: string;
  icon?: (color: string) => React.ReactNode;
}

// A two-or-more-way switch whose indicator slides to the selected option --
// the motion is the point: when the mode changes (by tap or by accepting a
// suggestion), the user sees where it went instead of the screen just
// changing under them. Follows the layout family like the rest of the app:
// 'line' gets an editorial underline that slides, every boxed layout gets
// a filled pill that slides inside a bordered track. `compact` is the
// icon-only form that sits inside another row (e.g. at the front of the
// search bar) -- always the pill style there, since a sliding underline
// under two small icons inside an already-underlined bar reads as noise.
const COMPACT_SEG = 30;

export function SegmentedToggle<K extends string>({
  options,
  value,
  onChange,
  theme,
  compact = false,
}: {
  options: SegmentOption<K>[];
  value: K;
  onChange: (key: K) => void;
  theme: Theme;
  compact?: boolean;
}) {
  const [width, setWidth] = useState(0);
  const index = Math.max(0, options.findIndex((o) => o.key === value));
  const x = useRef(new Animated.Value(index)).current;
  const line = theme.list === 'line' && !compact;
  const pad = line ? 0 : compact ? 2 : 3;
  // onLayout's width includes the 1px track border on each side (boxed
  // styles only); the thumb is positioned inside the border, so take both
  // the border and the padding out before splitting into segments.
  const segW = (width - (line ? 0 : pad * 2 + 2)) / options.length;

  useEffect(() => {
    Animated.spring(x, { toValue: index, useNativeDriver: true, friction: 9, tension: 80 }).start();
  }, [index, x]);

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  return (
    <View
      onLayout={onLayout}
      style={[
        styles.track,
        line
          ? { borderBottomWidth: 1, borderBottomColor: theme.soft }
          : {
              borderWidth: 1,
              borderColor: theme.line,
              borderRadius: compact ? 999 : theme.btnRadius + pad,
              padding: pad,
              backgroundColor: theme.bg,
            },
        compact && { width: COMPACT_SEG * options.length + pad * 2 + 2 },
      ]}
    >
      {width > 0 && (
        <Animated.View
          pointerEvents="none"
          style={[
            line
              ? { position: 'absolute', left: 0, bottom: -1, height: 2, backgroundColor: theme.accent }
              : {
                  position: 'absolute',
                  left: pad,
                  top: pad,
                  bottom: pad,
                  borderRadius: compact ? 999 : theme.btnRadius,
                  backgroundColor: theme.accent + '1f',
                  borderWidth: 1,
                  borderColor: theme.accent,
                },
            {
              width: segW,
              transform: [
                {
                  translateX: x.interpolate({
                    inputRange: [0, Math.max(1, options.length - 1)],
                    outputRange: [0, segW * Math.max(1, options.length - 1)],
                  }),
                },
              ],
            },
          ]}
        />
      )}
      {options.map((o) => {
        const active = o.key === value;
        const color = active ? theme.accent : theme.sub;
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            accessibilityRole="button"
            accessibilityLabel={o.label}
            accessibilityState={{ selected: active }}
            hitSlop={compact ? 4 : 0}
            style={[styles.segment, { paddingVertical: line ? 10 : compact ? 5 : 8 }]}
          >
            {o.icon?.(color)}
            {!compact && (
              <Text style={{ fontSize: 13.5, color, fontFamily: active ? 'IBMPlexSansKR_500Medium' : 'IBMPlexSansKR_400Regular' }}>
                {o.label}
              </Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', position: 'relative' },
  segment: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
});
