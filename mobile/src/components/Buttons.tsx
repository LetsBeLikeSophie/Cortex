import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { Theme } from '../theme/themes';

interface ButtonProps {
  label: string;
  onPress?: () => void;
  theme: Theme;
  flex?: number;
}

export function GhostButton({ label, onPress, theme, flex = 1 }: ButtonProps) {
  const cardVariant = theme.list === 'card';
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.base,
        {
          flex,
          borderRadius: theme.btnRadius,
          borderWidth: 1,
          borderColor: cardVariant ? theme.line : theme.ink,
          backgroundColor: cardVariant ? theme.surface : 'transparent',
        },
      ]}
    >
      <Text style={[styles.label, { color: theme.ink, fontFamily: 'IBMPlexSansKR_400Regular' }]}>{label}</Text>
    </Pressable>
  );
}

export function SolidButton({ label, onPress, theme, flex = 1.1 }: ButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.base, { flex, borderRadius: theme.btnRadius, backgroundColor: theme.ink }]}
    >
      <Text style={[styles.label, { color: theme.bg, fontFamily: 'IBMPlexSansKR_500Medium', fontWeight: '500' }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { minHeight: 52, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 15 },
});
