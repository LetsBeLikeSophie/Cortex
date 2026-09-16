import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { Theme, MONO } from '../theme/themes';

// Every chart here is monochrome-on-purpose: each theme defines exactly one
// accent color, so "categorical" color (donut segments, bar shades) comes
// from varying that single accent's opacity rather than introducing an
// unrelated rainbow palette that would fight the app's one-accent identity.
const SHADE_ALPHA = ['ff', 'b8', '8a', '63', '44', '2a'];

function shadeOf(color: string, index: number): string {
  return color + (SHADE_ALPHA[index] ?? SHADE_ALPHA[SHADE_ALPHA.length - 1]);
}

export function DonutChart({
  segments,
  theme,
  size = 148,
  strokeWidth = 20,
}: {
  segments: { label: string; value: number }[];
  theme: Theme;
  size?: number;
  strokeWidth?: number;
}) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  let cumulative = 0;

  return (
    <View style={styles.donutRow}>
      <Svg width={size} height={size}>
        <G rotation={-90} origin={`${size / 2}, ${size / 2}`}>
          <Circle cx={size / 2} cy={size / 2} r={radius} stroke={theme.line} strokeWidth={strokeWidth} fill="none" />
          {total > 0 &&
            segments.map((s, i) => {
              if (s.value === 0) return null;
              const fraction = s.value / total;
              const dash = fraction * circumference;
              const offset = -cumulative * circumference;
              cumulative += fraction;
              return (
                <Circle
                  key={s.label}
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  stroke={shadeOf(theme.accent, i)}
                  strokeWidth={strokeWidth}
                  strokeDasharray={`${dash} ${circumference - dash}`}
                  strokeDashoffset={offset}
                  fill="none"
                  strokeLinecap="butt"
                />
              );
            })}
        </G>
      </Svg>
      <View style={styles.legend}>
        {segments.map((s, i) => (
          <View key={s.label} style={styles.legendRow}>
            <View style={[styles.legendDot, { backgroundColor: shadeOf(theme.accent, i) }]} />
            <Text style={[styles.legendLabel, { color: theme.ink }]}>{s.label}</Text>
            <Text style={[styles.legendValue, { color: theme.sub }]}>{s.value}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export function BarChart({
  data,
  theme,
}: {
  data: { label: string; value: number }[];
  theme: Theme;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <View style={styles.barRow}>
      {data.map((d) => (
        <View key={d.label} style={styles.barCol}>
          <Text style={[styles.barValue, { color: theme.sub }]}>{d.value > 0 ? d.value : ''}</Text>
          <View style={styles.barTrack}>
            <View
              style={[
                styles.barFill,
                {
                  height: `${Math.max(d.value > 0 ? 6 : 0, (d.value / max) * 100)}%`,
                  backgroundColor: theme.accent,
                },
              ]}
            />
          </View>
          <Text style={[styles.barLabel, { color: theme.sub }]}>{d.label}</Text>
        </View>
      ))}
    </View>
  );
}

export function HorizontalBars({
  data,
  theme,
}: {
  data: { label: string; value: number }[];
  theme: Theme;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <View style={{ gap: 12 }}>
      {data.map((d) => (
        <View key={d.label}>
          <View style={styles.hBarLabelRow}>
            <Text style={[styles.hBarLabel, { color: theme.ink }]}>{d.label}</Text>
            <Text style={[styles.hBarValue, { color: theme.sub }]}>{d.value}</Text>
          </View>
          <View style={[styles.hBarTrack, { backgroundColor: theme.line }]}>
            <View style={[styles.hBarFill, { width: `${(d.value / max) * 100}%`, backgroundColor: theme.accent }]} />
          </View>
        </View>
      ))}
    </View>
  );
}

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];
const BAND_LABELS = ['새벽', '아침', '오후', '저녁'];

export function Heatmap({
  cells,
  theme,
}: {
  cells: { weekday: number; band: number; count: number }[];
  theme: Theme;
}) {
  const max = Math.max(1, ...cells.map((c) => c.count));
  const at = (weekday: number, band: number) => cells.find((c) => c.weekday === weekday && c.band === band)?.count ?? 0;

  return (
    <View>
      <View style={styles.heatmapHeaderRow}>
        <View style={styles.heatmapBandLabelSpacer} />
        {WEEKDAY_LABELS.map((w) => (
          <Text key={w} style={[styles.heatmapWeekdayLabel, { color: theme.sub }]}>
            {w}
          </Text>
        ))}
      </View>
      {BAND_LABELS.map((bandLabel, band) => (
        <View key={bandLabel} style={styles.heatmapRow}>
          <Text style={[styles.heatmapBandLabel, { color: theme.sub }]}>{bandLabel}</Text>
          {WEEKDAY_LABELS.map((_, weekday) => {
            const count = at(weekday, band);
            const opacity = count === 0 ? 0 : 0.22 + 0.78 * (count / max);
            return (
              <View key={weekday} style={styles.heatmapCellWrap}>
                <View
                  style={[
                    styles.heatmapCell,
                    { backgroundColor: theme.accent, opacity, borderColor: theme.line },
                  ]}
                />
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  donutRow: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  legend: { flex: 1, gap: 9 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legendDot: { width: 9, height: 9, borderRadius: 4.5 },
  legendLabel: { flex: 1, fontSize: 13, fontFamily: 'IBMPlexSansKR_400Regular' },
  legendValue: { fontSize: 12.5, fontFamily: MONO },

  barRow: { flexDirection: 'row', alignItems: 'flex-end', height: 140, gap: 10 },
  barCol: { flex: 1, alignItems: 'center', height: '100%', justifyContent: 'flex-end' },
  barValue: { fontSize: 10.5, fontFamily: MONO, marginBottom: 4 },
  barTrack: { width: '60%', flex: 1, justifyContent: 'flex-end' },
  barFill: { width: '100%', borderRadius: 4, minHeight: 2 },
  barLabel: { fontSize: 11, fontFamily: 'IBMPlexSansKR_400Regular', marginTop: 6 },

  hBarLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  hBarLabel: { fontSize: 13, fontFamily: 'IBMPlexSansKR_400Regular' },
  hBarValue: { fontSize: 12, fontFamily: MONO },
  hBarTrack: { height: 8, borderRadius: 4, overflow: 'hidden' },
  hBarFill: { height: '100%', borderRadius: 4 },

  heatmapHeaderRow: { flexDirection: 'row', marginBottom: 6 },
  heatmapBandLabelSpacer: { width: 38 },
  heatmapWeekdayLabel: { flex: 1, textAlign: 'center', fontSize: 10.5, fontFamily: MONO },
  heatmapRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  heatmapBandLabel: { width: 38, fontSize: 10.5, fontFamily: 'IBMPlexSansKR_400Regular' },
  heatmapCellWrap: { flex: 1, alignItems: 'center' },
  heatmapCell: { width: '78%', aspectRatio: 1, borderRadius: 5, borderWidth: 1 },
});
