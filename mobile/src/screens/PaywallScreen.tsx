import React, { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useTheme } from '../theme/ThemeContext';
import { allEdges } from '../theme/themes';
import { frameStyle } from '../components/Card';
import { fetchOffers, fetchPlan, Offers, Plan } from '../api/client';
import { ModalSheet } from '../components/ModalSheet';
import { Heading } from '../components/Typography';
import { ButtonRow, SolidButton } from '../components/Buttons';
import { CheckIcon } from '../components/Icons';
import type { PlanOption, StorePrices } from '../billing/types';
import type { RootStackParamList } from '../navigation/types';

// Cortex Pro. Opened when a metered AI feature runs out (미분류함, AI
// search, 모아서 만들기) or from the profile. The benefits state Pro's real
// monthly ceilings (from /me/plan). Buying goes through Google Play in the
// Android app (billing/AndroidPurchase); the web shows the plans but points
// to the app until a web checkout exists.
// expo-iap is native-only -- required on Android alone so the web bundle
// never loads it (same pattern as native/mediaLibrary).
const AndroidPurchase: typeof import('../billing/AndroidPurchase').AndroidPurchase | null =
  Platform.OS === 'android' ? require('../billing/AndroidPurchase').AndroidPurchase : null;

const FALLBACK_PRICE: Record<PlanOption, string> = {
  monthly: '월 3,900원',
  yearly: '연 29,000원',
  lifetime: '39,000원',
};

const HEADLINES = {
  classify: '이번 달 AI 정리를 다 썼어요',
  search: '이번 달 AI 검색을 다 썼어요',
  compose: '이번 달 모아서 만들기를 다 썼어요',
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
  const [offers, setOffers] = useState<Offers | null>(null);
  const [selected, setSelected] = useState<PlanOption>('yearly');
  const [prices, setPrices] = useState<StorePrices>({});

  useEffect(() => {
    fetchPlan()
      .then(setPlan)
      .catch(() => {});
    fetchOffers()
      .then(setOffers)
      .catch(() => {});
  }, []);

  const close = () => navigation.goBack();

  const pro = plan?.proLimits;
  const benefits = [
    pro ? `AI 정리 월 ${pro.classify.toLocaleString()}건 — 저장하는 대로 바로 정리돼요` : '저장하는 대로 AI가 바로 정리해요',
    plan && plan.unclassifiedCount > 0 ? `미분류함 ${plan.unclassifiedCount}건도 한 번에 정리돼요` : '미분류함에 쌓이지 않아요',
    pro ? `AI 검색 월 ${pro.search.toLocaleString()}회` : 'AI 검색을 넉넉하게',
    pro?.compose ? `태그별로 모아서 코스·목록 만들기 월 ${pro.compose.toLocaleString()}회` : '태그별로 모아서 코스·목록 만들기',
  ];

  const status =
    plan?.tier === 'trial'
      ? `무료 체험 중 · ${daysLeft(plan.trialEndsAt)}일 남음`
      : plan?.tier === 'pro'
        ? 'Pro 이용 중'
        : plan
          ? `무료 · 이번 달 AI 정리 ${plan.classify.used}/${plan.classify.limit}건 · AI 검색 ${plan.search.used}/${plan.search.limit}회`
          : '';

  const lifetimeLeft = offers?.enabled ? offers.lifetimeRemaining : 0;
  const options: { key: PlanOption; label: string; note: string }[] = [
    { key: 'monthly', label: '월간', note: '언제든 해지할 수 있어요' },
    { key: 'yearly', label: '연간', note: '월 2,417원꼴 · 두 달 넘게 아껴요' },
    ...(lifetimeLeft > 0 ? [{ key: 'lifetime' as const, label: '평생', note: `선착순 · ${lifetimeLeft}개 남음 · 한 번 결제로 계속` }] : []),
  ];
  const canBuy = Platform.OS === 'android' && !!offers?.enabled && plan?.tier !== 'pro';

  return (
    <ModalSheet theme={theme} onClose={close} bordered={false} paddingBottom={24} paddingHorizontal={20} maxHeightRatio={0.9}>
      <Heading theme={theme} size={24} style={styles.heading}>
        {HEADLINES[reason ?? 'default']}
      </Heading>
      {reason && (
        <Text style={[styles.sub, { color: theme.sub }]}>
          저장은 계속 돼요. AI 기능은 다음 달에 다시 생기거나, Pro로 바로 이어서 쓸 수 있어요.
        </Text>
      )}

      <View style={[styles.card, { backgroundColor: theme.surface, ...frameStyle(theme), borderRadius: theme.cardRadius }]}>
        <Text style={[styles.planName, { color: theme.ink }]}>Pro</Text>
        {benefits.map((b) => (
          <View key={b} style={styles.benefit}>
            <CheckIcon size={16} color={theme.accent} strokeWidth={2} />
            <Text style={[styles.benefitText, { color: theme.ink }]}>{b}</Text>
          </View>
        ))}
      </View>

      {/* The plans. Prices come from Google Play once the store answers
          (what the person will actually be charged). */}
      <View style={styles.options}>
        {options.map((o) => {
          const active = selected === o.key;
          return (
            <Pressable
              key={o.key}
              onPress={() => setSelected(o.key)}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              style={[styles.option, frameStyle(theme), active && allEdges(2, theme.ink), { borderRadius: theme.cardRadius }]}
            >
              <View style={styles.optionHead}>
                <Text style={[styles.optionLabel, { color: theme.ink }]}>{o.label}</Text>
                <Text style={[styles.optionPrice, { color: theme.ink }]}>{prices[o.key] ?? FALLBACK_PRICE[o.key]}</Text>
              </View>
              <Text style={[styles.optionNote, { color: theme.sub }]}>{o.note}</Text>
            </Pressable>
          );
        })}
      </View>

      {status !== '' && <Text style={[styles.status, { color: theme.sub }]}>{status}</Text>}

      {canBuy && offers && AndroidPurchase ? (
        <AndroidPurchase theme={theme} offers={offers} selected={selected} onPrices={setPrices} onPlan={setPlan} onClose={close} />
      ) : (
        <>
          <Text style={[styles.status, { color: theme.sub }]}>
            {plan?.tier === 'pro'
              ? '이미 Pro를 쓰고 있어요.'
              : Platform.OS !== 'android'
                ? '결제는 안드로이드 앱(플레이스토어에서 설치)에서 할 수 있어요.'
                : '결제를 준비하고 있어요. 조금만 기다려 주세요.'}
          </Text>
          <ButtonRow theme={theme} style={styles.buttons}>
            <SolidButton label="닫기" theme={theme} onPress={close} />
          </ButtonRow>
        </>
      )}
    </ModalSheet>
  );
}

const styles = StyleSheet.create({
  heading: { paddingHorizontal: 4 },
  sub: { fontSize: 13.5, lineHeight: 20, marginTop: 8, paddingHorizontal: 4, fontFamily: 'IBMPlexSansKR_400Regular' },
  card: { padding: 18, marginTop: 18, gap: 12 },
  planName: { fontSize: 20, fontFamily: 'IBMPlexSansKR_500Medium', marginBottom: 2 },
  benefit: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  benefitText: { flex: 1, fontSize: 14, lineHeight: 20, fontFamily: 'IBMPlexSansKR_400Regular' },
  options: { gap: 8, marginTop: 14 },
  option: { paddingHorizontal: 16, paddingVertical: 12 },
  optionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  optionLabel: { fontSize: 15, fontFamily: 'IBMPlexSansKR_500Medium' },
  optionPrice: { fontSize: 15, fontFamily: 'IBMPlexSansKR_500Medium' },
  optionNote: { fontSize: 12.5, marginTop: 3, fontFamily: 'IBMPlexSansKR_400Regular' },
  status: { fontSize: 12.5, marginTop: 12, paddingHorizontal: 4, fontFamily: 'IBMPlexSansKR_400Regular' },
  buttons: { marginTop: 18 },
});
