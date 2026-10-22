import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useTheme } from '../theme/ThemeContext';
import { allEdges } from '../theme/themes';
import { ApiError, asQuotaError, composeFromTag, ComposeFormat, fetchPlan, friendlyError, Plan } from '../api/client';
import { ModalSheet } from '../components/ModalSheet';
import { Heading } from '../components/Typography';
import { ButtonRow, GhostButton, SolidButton } from '../components/Buttons';
import { frameStyle } from '../components/Card';
import { SparkleIcon } from '../components/Icons';
import type { RootStackParamList } from '../navigation/types';

// "모아서 만들기": everything under one tag becomes one new memo, in the
// shape picked here. The result is saved as a text memo carrying the tag
// and opened right away. One run per press, metered monthly.
const FORMATS: { key: ComposeFormat; label: string; note: string }[] = [
  { key: 'course', label: '코스·동선', note: '가볼 곳을 지역별로 묶고 순서를 짜요' },
  { key: 'list', label: '목록·비교', note: '항목마다 가격·장소·내 메모를 한 줄로 정리해요' },
  { key: 'summary', label: '요약 노트', note: '전체 내용을 요점만 모아 정리해요' },
];

export default function ComposeScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { tag, count, suggested } = useRoute<RouteProp<RootStackParamList, 'Compose'>>().params;
  const [format, setFormat] = useState<ComposeFormat>(suggested ?? 'summary');
  const [plan, setPlan] = useState<Plan | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchPlan()
      .then(setPlan)
      .catch(() => {});
  }, []);

  const close = () => navigation.goBack();
  const left = plan?.compose ? Math.max(0, plan.compose.limit - plan.compose.used) : null;

  const make = async () => {
    if (left === 0) {
      navigation.replace('Paywall', { reason: 'compose' });
      return;
    }
    setError('');
    setWorking(true);
    try {
      const { item, sourceCount } = await composeFromTag(tag, format);
      navigation.replace('ItemDetail', {
        item,
        composedFrom: { tag, count: sourceCount, left: left !== null ? Math.max(0, left - 1) : undefined },
      });
    } catch (err) {
      if (asQuotaError(err)) {
        navigation.replace('Paywall', { reason: 'compose' });
        return;
      }
      if (err instanceof ApiError && (err.body as { error?: string } | null)?.error === 'too_few') {
        setError('이 태그에 저장된 게 2개 이상 있어야 만들 수 있어요.');
      } else {
        setError(friendlyError(err));
      }
      setWorking(false);
    }
  };

  return (
    <ModalSheet theme={theme} onClose={working ? () => {} : close} paddingBottom={24} paddingHorizontal={20}>
      <View style={styles.titleRow}>
        <SparkleIcon color={theme.accent} size={18} strokeWidth={1.5} />
        <Heading theme={theme} size={22}>
          {`'${tag}' 모아서 만들기`}
        </Heading>
      </View>
      <Text style={[styles.sub, { color: theme.sub }]}>
        {`저장한 ${Math.min(count, 50)}개를 AI가 한 메모로 정리해요. 저장된 내용 안에서만 쓰고, 없는 정보는 지어내지 않아요.`}
        {left !== null ? ` · 이번 달 ${left}회 남음` : ''}
      </Text>

      <View style={styles.options}>
        {FORMATS.map((f) => {
          const active = format === f.key;
          return (
            <Pressable
              key={f.key}
              onPress={() => setFormat(f.key)}
              disabled={working}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              style={[styles.option, frameStyle(theme), active && allEdges(2, theme.ink), { borderRadius: theme.cardRadius }]}
            >
              <Text style={[styles.optionLabel, { color: theme.ink }]}>
                {f.label}
                {f.key === suggested ? <Text style={{ color: theme.accent }}>  추천</Text> : null}
              </Text>
              <Text style={[styles.optionNote, { color: theme.sub }]}>{f.note}</Text>
            </Pressable>
          );
        })}
      </View>

      {working && <Text style={[styles.sub, { color: theme.sub }]}>AI가 정리하고 있어요. 10~20초쯤 걸려요.</Text>}
      {error !== '' && <Text style={[styles.error, { color: theme.danger }]}>{error}</Text>}

      <ButtonRow theme={theme} style={styles.buttons}>
        <GhostButton label="취소" theme={theme} onPress={close} disabled={working} />
        <SolidButton label={left === 0 ? 'Pro로 만들기' : '만들기'} theme={theme} onPress={make} loading={working} />
      </ButtonRow>
    </ModalSheet>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 },
  sub: { fontSize: 13, lineHeight: 19, marginTop: 10, paddingHorizontal: 4, fontFamily: 'IBMPlexSansKR_400Regular' },
  options: { gap: 8, marginTop: 16 },
  option: { paddingHorizontal: 16, paddingVertical: 12 },
  optionLabel: { fontSize: 15, fontFamily: 'IBMPlexSansKR_500Medium' },
  optionNote: { fontSize: 12.5, marginTop: 3, fontFamily: 'IBMPlexSansKR_400Regular' },
  error: { fontSize: 12.5, marginTop: 12, paddingHorizontal: 4, fontFamily: 'IBMPlexSansKR_400Regular' },
  buttons: { marginTop: 18 },
});
