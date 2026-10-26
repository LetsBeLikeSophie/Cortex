import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useTheme } from '../theme/ThemeContext';
import { fetchStats, ItemStats, friendlyError } from '../api/client';
import { sourceLabel, SOURCE_ORDER } from '../api/format';
import { BarChart, HorizontalBars, Heatmap } from '../components/Charts';
import { AsyncStateView } from '../components/AsyncStateView';
import { Card, isBoxed, screenGutter } from '../components/Card';
import { allEdges, BODY_KR } from '../theme/themes';
import { ScreenHeader } from '../components/ScreenHeader';
import { VintageWallpaper } from '../components/Decor';
import type { RootStackParamList } from '../navigation/types';
import { strings } from '../i18n';

const S = strings({
  ko: {
    title: '저장 통계',
    empty: '아직 통계를 보여드릴 만큼 저장된 게 없어요.',
    byTag: '많이 쓴 태그',
    when: '언제 많이 저장했나요',
    whenNote: '요일 × 시간대 저장 빈도',
    where: '어디서 가져왔나요',
    byMonth: '월별 저장 추이',
    byMonthNote: '최근 6개월',
    month: (m: number) => `${m}월`,
  },
  en: {
    title: 'Stats',
    empty: 'Not enough saves for stats yet.',
    byTag: 'Top tags',
    when: 'When you save',
    whenNote: 'Day × time of day',
    where: 'Where from',
    byMonth: 'By month',
    byMonthNote: 'Last 6 months',
    month: (m: number) => ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1] ?? String(m),
  },
  ja: {
    title: '保存の統計',
    empty: '統計を出せるほどの保存がまだありません。',
    byTag: 'よく使うタグ',
    when: 'いつよく保存しましたか',
    whenNote: '曜日 × 時間帯の保存頻度',
    where: 'どこから保存しましたか',
    byMonth: '月別の保存推移',
    byMonthNote: '直近6か月',
    month: (m: number) => `${m}月`,
  },
  'zh-Hans': {
    title: '保存统计',
    empty: '保存的内容还不够生成统计。',
    byTag: '常用标签',
    when: '什么时候保存最多',
    whenNote: '星期 × 时段保存频率',
    where: '从哪里保存的',
    byMonth: '每月保存趋势',
    byMonthNote: '最近6个月',
    month: (m: number) => `${m}月`,
  },
  'zh-Hant': {
    title: '儲存統計',
    empty: '儲存的內容還不夠產生統計。',
    byTag: '常用標籤',
    when: '什麼時候儲存最多',
    whenNote: '星期 × 時段儲存頻率',
    where: '從哪裡儲存的',
    byMonth: '每月儲存趨勢',
    byMonthNote: '最近6個月',
    month: (m: number) => `${m}月`,
  },
});

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
      <ScreenHeader title={S.title} theme={theme} onBack={() => navigation.goBack()} />

      <AsyncStateView
        theme={theme}
        loading={loading}
        error={error}
        onRetry={load}
        empty={!stats || stats.total === 0}
        emptyText={S.empty}
        topOffset={60}
      >
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: screenGutter(theme), paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          {(stats?.byTag?.length ?? 0) > 0 && (
            <Section title={S.byTag} theme={theme}>
              <HorizontalBars theme={theme} data={(stats?.byTag ?? []).map((t) => ({ label: t.tag, value: t.count }))} />
            </Section>
          )}

          <Section title={S.when} note={S.whenNote} theme={theme}>
            <Heatmap theme={theme} cells={stats?.heatmap ?? []} />
          </Section>

          <Section title={S.where} theme={theme}>
            <HorizontalBars
              theme={theme}
              data={SOURCE_ORDER.map((src) => ({
                label: sourceLabel(src, false),
                value: stats?.bySource.find((s) => s.source === src)?.count ?? 0,
              })).filter((d) => d.value > 0)}
            />
          </Section>

          <Section title={S.byMonth} note={S.byMonthNote} theme={theme}>
            <BarChart
              theme={theme}
              data={(stats?.byMonth ?? []).map((m) => ({
                label: /^\d{4}-\d{2}$/.test(m.month) ? S.month(parseInt(m.month.slice(5), 10)) : m.month,
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
  sectionNote: { fontSize: 12, marginTop: 3, fontFamily: BODY_KR },
});
