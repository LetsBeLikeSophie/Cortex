import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useTheme } from '../theme/ThemeContext';
import { frameStyle } from '../components/Card';
import { fetchPlan, Plan } from '../api/client';
import { ModalSheet } from '../components/ModalSheet';
import { Heading } from '../components/Typography';
import { ButtonRow, GhostButton, SolidButton } from '../components/Buttons';
import { CheckIcon } from '../components/Icons';
import { showToast } from '../native/toast';
import type { RootStackParamList } from '../navigation/types';

// Cortex Pro. Opened when a metered AI feature runs out (미분류함's "Pro로
// 바로 정리", sentence search's quota message) or from the profile. The
// benefits state Pro's real monthly ceilings (from /me/plan) -- it isn't
// unlimited, and the copy shouldn't say so. The buy
// button stays disabled until Play Billing ships with the Play Store
// release -- the sheet itself is real so the upgrade moment can be tested.
const PRICE = '월 3,900원';

const HEADLINES = {
  classify: '이번 달 AI 정리를 다 썼어요',
  search: '이번 달 문장 검색을 다 썼어요',
  default: 'Cortex Pro',
} as const;

function daysLeft(iso: string): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
}

export default function PaywallScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'Paywall'>>();
  const reason = route.params?.reason;
  const [plan, setPlan] = useState<Plan | null>(null);

  useEffect(() => {
    fetchPlan()
      .then(setPlan)
      .catch(() => {});
  }, []);

  const close = () => navigation.goBack();

  const pro = plan?.proLimits;
  const benefits = [
    pro ? `AI 정리 월 ${pro.classify.toLocaleString()}건 — 저장하는 대로 바로 정리돼요` : '저장하는 대로 AI가 바로 정리해요',
    plan && plan.unclassifiedCount > 0 ? `미분류함 ${plan.unclassifiedCount}건도 한 번에 정리돼요` : '미분류함에 쌓이지 않아요',
    pro ? `문장으로 찾기 월 ${pro.search.toLocaleString()}회` : '문장으로 찾기를 넉넉하게',
  ];

  const status =
    plan?.tier === 'trial'
      ? `무료 체험 중 · ${daysLeft(plan.trialEndsAt)}일 남음`
      : plan?.tier === 'pro'
        ? 'Pro 이용 중'
        : plan
          ? `무료 · 이번 달 AI 정리 ${plan.classify.used}/${plan.classify.limit}건 · 문장 검색 ${plan.search.used}/${plan.search.limit}회`
          : '';

  return (
    <ModalSheet theme={theme} onClose={close} bordered={false} paddingBottom={24} paddingHorizontal={20}>
      <Heading theme={theme} size={24} style={styles.heading}>
        {HEADLINES[reason ?? 'default']}
      </Heading>
      {reason && (
        <Text style={[styles.sub, { color: theme.sub }]}>
          저장은 계속 돼요. 정리와 문장 검색은 다음 달에 다시 생기거나, Pro로 바로 이어서 쓸 수 있어요.
        </Text>
      )}

      <View style={[styles.card, { backgroundColor: theme.surface, ...frameStyle(theme), borderRadius: theme.cardRadius }]}>
        <View style={styles.priceRow}>
          <Text style={[styles.planName, { color: theme.ink }]}>Pro</Text>
          <Text style={[styles.price, { color: theme.accent }]}>{PRICE}</Text>
        </View>
        {benefits.map((b) => (
          <View key={b} style={styles.benefit}>
            <CheckIcon size={16} color={theme.accent} strokeWidth={2} />
            <Text style={[styles.benefitText, { color: theme.ink }]}>{b}</Text>
          </View>
        ))}
      </View>

      {status !== '' && <Text style={[styles.status, { color: theme.sub }]}>{status}</Text>}

      <ButtonRow theme={theme} style={styles.buttons}>
        <GhostButton label="나중에" theme={theme} onPress={close} />
        <SolidButton label="곧 열려요" theme={theme} onPress={() => showToast('결제는 Play스토어 출시와 함께 열려요')} />
      </ButtonRow>
    </ModalSheet>
  );
}

const styles = StyleSheet.create({
  heading: { paddingHorizontal: 4 },
  sub: { fontSize: 13.5, lineHeight: 20, marginTop: 8, paddingHorizontal: 4, fontFamily: 'IBMPlexSansKR_400Regular' },
  card: { padding: 18, marginTop: 18, gap: 12 },
  priceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 2 },
  planName: { fontSize: 20, fontFamily: 'IBMPlexSansKR_500Medium' },
  price: { fontSize: 15, fontFamily: 'IBMPlexSansKR_500Medium' },
  benefit: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  benefitText: { flex: 1, fontSize: 14, lineHeight: 20, fontFamily: 'IBMPlexSansKR_400Regular' },
  status: { fontSize: 12.5, marginTop: 12, paddingHorizontal: 4, fontFamily: 'IBMPlexSansKR_400Regular' },
  buttons: { marginTop: 18 },
});
