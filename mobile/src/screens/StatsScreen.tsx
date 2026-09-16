import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useTheme } from '../theme/ThemeContext';
import { emToTracking } from '../theme/themes';
import { MOCK_STATS } from '../data/content';
import { fetchStats, ItemStats } from '../api/client';
import { sourceLabel, SOURCE_ORDER } from '../api/format';
import { ALL_CATEGORIES } from '../data/tabs';
import { BackIcon } from '../components/Icons';
import { DonutChart, BarChart, HorizontalBars, Heatmap } from '../components/Charts';
import type { RootStackParamList } from '../navigation/types';

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
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [stats, setStats] = useState<ItemStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const card = theme.list === 'card';

  useEffect(() => {
    fetchStats()
      .then((res) => {
        setStats(res);
        setOffline(false);
      })
      .catch(() => setOffline(true))
      .finally(() => setLoading(false));
  }, []);

  const data = offline ? (MOCK_STATS as ItemStats) : stats;

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: theme.bg }]} edges={['top']}>
      <View style={[styles.header, { paddingHorizontal: card ? 24 : 26 }]}>
        <Pressable onPress={() => navigation.goBack()} style={[styles.backButton, { borderColor: theme.line }]} hitSlop={8}>
          <BackIcon size={16} color={theme.ink} strokeWidth={1.5} />
        </Pressable>
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
      ) : !data || data.total === 0 ? (
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
                value: data.byCategory.find((c) => c.category === cat)?.count ?? 0,
              }))}
            />
          </Section>

          <Section title="언제 많이 저장했나요" note="요일 × 시간대 저장 빈도" theme={theme}>
            <Heatmap theme={theme} cells={data.heatmap} />
          </Section>

          <Section title="어디서 가져왔나요" theme={theme}>
            <HorizontalBars
              theme={theme}
              data={SOURCE_ORDER.map((src) => ({
                label: sourceLabel(src, false),
                value: data.bySource.find((s) => s.source === src)?.count ?? 0,
              })).filter((d) => d.value > 0)}
            />
          </Section>

          <Section title="월별 저장 추이" note="최근 6개월" theme={theme}>
            <BarChart
              theme={theme}
              data={data.byMonth.map((m) => ({
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
  backButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: { marginTop: 20 },
  sectionTitle: { fontSize: 17 },
  sectionNote: { fontSize: 12, marginTop: 3, fontFamily: 'IBMPlexSansKR_400Regular' },
});
