import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Theme } from '../theme/themes';

// The loading/error/empty branch every fetch-backed screen was repeating
// verbatim (Home, Search, Stats each had their own copy of the same "불러오지
// 못했어요" + 다시 시도 box) -- one place for it so a copy or style tweak
// lands everywhere, and any new fetch-backed screen gets it for free.
export function AsyncStateView({
  theme,
  loading,
  error,
  onRetry,
  empty,
  emptyText,
  topOffset = 40,
  children,
}: {
  theme: Theme;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  empty: boolean;
  // A plain string renders centered in the default style (Home/Stats); pass
  // a full element instead when a screen needs its own layout for the empty
  // state (Search's left-aligned two-liner).
  emptyText: string | React.ReactNode;
  topOffset?: number;
  children: React.ReactNode;
}) {
  if (loading) {
    return <ActivityIndicator color={theme.accent} style={{ marginTop: topOffset }} />;
  }
  if (error) {
    return (
      <View style={{ marginTop: topOffset, alignItems: 'center', paddingHorizontal: 24 }}>
        <Text style={[styles.message, { color: theme.sub }]}>
          불러오지 못했어요.{'\n'}
          {error}
        </Text>
        <Pressable onPress={onRetry} style={[styles.retryButton, { borderColor: theme.line }]}>
          <Text style={{ color: theme.ink, fontFamily: 'IBMPlexSansKR_500Medium', fontSize: 13.5 }}>다시 시도</Text>
        </Pressable>
      </View>
    );
  }
  if (empty) {
    return typeof emptyText === 'string' ? (
      <Text style={[styles.message, styles.empty, { color: theme.sub, marginTop: topOffset }]}>{emptyText}</Text>
    ) : (
      <>{emptyText}</>
    );
  }
  return <>{children}</>;
}

const styles = StyleSheet.create({
  message: { textAlign: 'center', fontFamily: 'IBMPlexSansKR_400Regular' },
  empty: { paddingHorizontal: 24 },
  retryButton: { marginTop: 16, borderWidth: 1, borderRadius: 999, paddingHorizontal: 20, paddingVertical: 10 },
});
