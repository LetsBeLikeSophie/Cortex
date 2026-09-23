import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';

import { useTheme } from '../theme/ThemeContext';
import { emToTracking } from '../theme/themes';
import { fetchStats, ItemStats } from '../api/client';
import { sourceLabel, SOURCE_ORDER } from '../api/format';
import { ALL_CATEGORIES } from '../data/tabs';
import { DonutChart, BarChart, HorizontalBars, Heatmap } from '../components/Charts';

function Section({ title, note, children, theme }: { title: string; note?: string; children: React.ReactNode; theme: ReturnType<typeof useTheme>['theme'] }) {
  const card = theme.list === 'card';
  return (
    <View
      style={[
        styles.section,
        card
          ? {
              backgroundColor: theme.surface,
              borderRadius: theme.cardRadius,
              borderWidth: theme.surfaceEdge ? 1 : 0,
              borderColor: theme.surfaceEdge ?? undefined,
              padding: 18,
            }
          : { borderTopWidth: 1, borderTopColor: theme.line, paddingTop: 22 },
      ]}
    >
      <Text style={[styles.sectionTitle, { color: theme.ink, fontFamily: theme.headFamily, fontWeight: theme.headWeight }]}>
        {title}
      </Text>
      {note && <Text style={[styles.sectionNote, { color: theme.sub }]}>{note}</Text>}
      <View style={{ marginTop: 16 }}>{children}</View>
    </View>
  );
}

export default function StatsScreen() {
  const { theme } = useTheme();
  const [stats, setStats] = useState<ItemStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const card = theme.list === 'card';

  const load = React.useCallback(() => {
    setLoading(true);
    fetchStats()
      .then((res) => {
        setStats(res);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, []);

  // A persistent tab now rather than a screen pushed fresh each time --
  // refetch on regaining focus (e.g. after saving something new) instead of
  // only once on first mount.
  useFocusEffect(
    React.useCallback(() => {
      load();
    }, [load])
  );

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: theme.bg }]} edges={['top']}>
      <View style={[styles.header, { paddingHorizontal: card ? 24 : 26 }]}>
        <Text
          style={{
            fontFamily: theme.headFamily,
            fontWeight: theme.headWeight,
            fontSize: theme.headSize - 8,
            color: theme.ink,
            letterSpacing: emToTracking(-0.02, theme.headSize - 8),
          }}
        >
          저장 통계
        </Text>
      </View>

      {loading ? (
        <ActivityIndicator color={theme.accent} style={{ marginTop: 60 }} />
      ) : error ? (
        <View style={{ marginTop: 60, alignItems: 'center', paddingHorizontal: 24 }}>
          <Text style={{ color: theme.sub, textAlign: 'center', fontFamily: 'IBMPlexSansKR_400Regular' }}>
            불러오지 못했어요.{'\n'}
            {error}
          </Text>
          <Pressable onPress={load} style={[styles.retryButton, { borderColor: theme.line }]}>
            <Text style={{ color: theme.ink, fontFamily: 'IBMPlexSansKR_500Medium', fontSize: 13.5 }}>다시 시도</Text>
          </Pressable>
        </View>
      ) : !stats || stats.total === 0 ? (
        <Text style={{ color: theme.sub, textAlign: 'center', marginTop: 60, fontFamily: 'IBMPlexSansKR_400Regular' }}>
          아직 통계를 보여드릴 만큼 저장된 게 없어요.
        </Text>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: card ? 24 : 26, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          <Section title="카테고리 비율" theme={theme}>
            <DonutChart
              theme={theme}
              segments={ALL_CATEGORIES.map((cat) => ({
                label: cat,
                value: stats.byCategory.find((c) => c.category === cat)?.count ?? 0,
              }))}
            />
          </Section>

          <Section title="언제 많이 저장했나요" note="요일 × 시간대 저장 빈도" theme={theme}>
            <Heatmap theme={theme} cells={stats.heatmap} />
          </Section>

          <Section title="어디서 가져왔나요" theme={theme}>
            <HorizontalBars
              theme={theme}
              data={SOURCE_ORDER.map((src) => ({
                label: sourceLabel(src, false),
                value: stats.bySource.find((s) => s.source === src)?.count ?? 0,
              })).filter((d) => d.value > 0)}
            />
          </Section>

          <Section title="월별 저장 추이" note="최근 6개월" theme={theme}>
            <BarChart
              theme={theme}
              data={stats.byMonth.map((m) => ({
                label: /^\d{4}-\d{2}$/.test(m.month) ? `${parseInt(m.month.slice(5), 10)}월` : m.month,
                value: m.count,
              }))}
            />
          </Section>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingTop: 20, paddingBottom: 18 },
  section: { marginTop: 20 },
  sectionTitle: { fontSize: 17 },
  sectionNote: { fontSize: 12, marginTop: 3, fontFamily: 'IBMPlexSansKR_400Regular' },
  retryButton: { marginTop: 16, borderWidth: 1, borderRadius: 999, paddingHorizontal: 20, paddingVertical: 10 },
});
