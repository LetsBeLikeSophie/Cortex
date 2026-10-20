import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useTheme } from '../theme/ThemeContext';
import { fetchStats, ItemStats, friendlyError } from '../api/client';
import { sourceLabel, SOURCE_ORDER } from '../api/format';
import { ALL_CATEGORIES } from '../data/tabs';
import { DonutChart, BarChart, HorizontalBars, Heatmap } from '../components/Charts';
import { AsyncStateView } from '../components/AsyncStateView';
import { Card, isBoxed, screenGutter } from '../components/Card';
import { allEdges } from '../theme/themes';
import { ScreenHeader } from '../components/ScreenHeader';
import { VintageWallpaper } from '../components/Decor';
import type { RootStackParamList } from '../navigation/types';

function Section({ title, note, children, theme }: { title: string; note?: string; children: React.ReactNode; theme: ReturnType<typeof useTheme>['theme'] }) {
  const body = (
    <>
      <Text style={[styles.sectionTitle, { color: theme.ink, fontFamily: theme.headFamily, fontWeight: theme.headWeight }]}>
        {title}
      </Text>
      {note && <Text style={[styles.sectionNote, { color: theme.sub }]}>{note}</Text>}
      <View style={{ marginTop: 16 }}>{children}</View>
    </>
  );
  // Line keeps its section rule on top; boxed layouts use the shared card.
  if (!isBoxed(theme)) {
    return <View style={[styles.section, { ...allEdges(0, 'transparent'), borderTopWidth: 1, borderTopColor: theme.line, paddingTop: 22 }]}>{body}</View>;
  }
  return (
    <View style={styles.section}>
      <Card theme={theme} style={{ padding: 18 }}>
        {body}
      </Card>
    </View>
  );
}

export default function StatsScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [stats, setStats] = useState<ItemStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = React.useCallback(() => {
    setLoading(true);
    fetchStats()
      .then((res) => {
        setStats(res);
        setError(null);
      })
      .catch((err) => setError(friendlyError(err)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: theme.bg }]} edges={['top']}>
      <VintageWallpaper theme={theme} />
      <ScreenHeader title="저장 통계" theme={theme} onBack={() => navigation.goBack()} />

      <AsyncStateView
        theme={theme}
        loading={loading}
        error={error}
        onRetry={load}
        empty={!stats || stats.total === 0}
        emptyText="아직 통계를 보여드릴 만큼 저장된 게 없어요."
        topOffset={60}
      >
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: screenGutter(theme), paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          <Section title="카테고리 비율" theme={theme}>
            <DonutChart
              theme={theme}
              segments={ALL_CATEGORIES.map((cat) => ({
                label: cat,
                value: stats?.byCategory.find((c) => c.category === cat)?.count ?? 0,
              }))}
            />
          </Section>

          <Section title="언제 많이 저장했나요" note="요일 × 시간대 저장 빈도" theme={theme}>
            <Heatmap theme={theme} cells={stats?.heatmap ?? []} />
          </Section>

          <Section title="어디서 가져왔나요" theme={theme}>
            <HorizontalBars
              theme={theme}
              data={SOURCE_ORDER.map((src) => ({
                label: sourceLabel(src, false),
                value: stats?.bySource.find((s) => s.source === src)?.count ?? 0,
              })).filter((d) => d.value > 0)}
            />
          </Section>

          <Section title="월별 저장 추이" note="최근 6개월" theme={theme}>
            <BarChart
              theme={theme}
              data={(stats?.byMonth ?? []).map((m) => ({
                label: /^\d{4}-\d{2}$/.test(m.month) ? `${parseInt(m.month.slice(5), 10)}월` : m.month,
                value: m.count,
              }))}
            />
          </Section>
        </ScrollView>
      </AsyncStateView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  section: { marginTop: 20 },
  sectionTitle: { fontSize: 17 },
  sectionNote: { fontSize: 12, marginTop: 3, fontFamily: 'IBMPlexSansKR_400Regular' },
});
