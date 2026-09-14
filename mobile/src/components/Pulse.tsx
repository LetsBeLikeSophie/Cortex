import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

// The Neural theme's "LIVE" indicator: a small solid dot with an expanding,
// fading ring — ported from the design's `pulseRing` keyframes
// (scale 0.9 → 1.4, opacity 0.55 → 0, 2.4s ease-out, looping).
export function Pulse({ color, active }: { color: string; active: boolean }) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!active) return;
    progress.setValue(0);
    const loop = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: 2400,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [active, progress]);

  const scale = progress.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.4] });
  const opacity = progress.interpolate({ inputRange: [0, 0.001, 1], outputRange: [0.55, 0.55, 0] });

  return (
    <View style={styles.wrap}>
      {active && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.ring,
            { borderColor: color, opacity, transform: [{ scale }] },
          ]}
        />
      )}
      <View style={[styles.dot, { backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: 8, height: 8, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  ring: { position: 'absolute', width: 18, height: 18, borderRadius: 9, borderWidth: 1 },
});
