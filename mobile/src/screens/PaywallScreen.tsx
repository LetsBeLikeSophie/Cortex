import React, { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
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
import { PLAY_SUBSCRIPTIONS_URL, isLifetimePro } from '../billing/types';
import type { PlanOption, StorePrices } from '../billing/types';
import type { RootStackParamList } from '../navigation/types';
import { strings } from '../i18n';
import { COMMON } from '../i18n/common';

// Cortex Pro. Opened when a metered AI feature runs out (미분류함, AI
// search, 모아서 만들기) or from the profile. The benefits state Pro's real
// monthly ceilings (from /me/plan). Buying goes through Google Play in the
// Android app (billing/AndroidPurchase); the web shows the plans but points
// to the app until a web checkout exists.
// expo-iap is native-only -- required on Android alone so the web bundle
// never loads it (same pattern as native/mediaLibrary).
const AndroidPurchase: typeof import('../billing/AndroidPurchase').AndroidPurchase | null =
  Platform.OS === 'android' ? require('../billing/AndroidPurchase').AndroidPurchase : null;

const S = strings({
  ko: {
    fallback: { monthly: '월 3,900원', yearly: '연 29,000원', lifetime: '39,000원' },
    headlines: {
      classify: '이번 달 AI 정리를 다 썼어요',
      search: '이번 달 AI 검색을 다 썼어요',
      compose: '이번 달 모아서 만들기를 다 썼어요',
      tag_cleanup: '이번 달 태그 정리하기를 다 썼어요',
      default: 'Cortex Pro',
    },
    date: (y: number, m: number, d: number) => `${y}년 ${m}월 ${d}일`,
    classifyN: (n: string) => `AI 정리 월 ${n}건 — 저장하는 대로 바로 정리돼요`,
    classify: '저장하는 대로 AI가 바로 정리해요',
    backlogN: (n: number) => `미분류함 ${n}건도 한 번에 정리돼요`,
    backlog: '미분류함에 쌓이지 않아요',
    searchN: (n: string) => `AI 검색 월 ${n}회`,
    search: 'AI 검색을 넉넉하게',
    composeN: (n: string) => `태그별로 모아서 코스·목록 만들기 월 ${n}회`,
    compose: '태그별로 모아서 코스·목록 만들기',
    trial: (days: number) => `무료 체험 중 · ${days}일 남음`,
    lifetimePro: 'Pro 평생 이용 중',
    pro: (until: string | null) => `Pro 이용 중${until ? ` · ${until}까지` : ''}`,
    free: (cu: number, cl: number, su: number, sl: number) => `무료 · 이번 달 AI 정리 ${cu}/${cl}건 · AI 검색 ${su}/${sl}회`,
    monthly: '월간',
    monthlyNote: '매달 자동 갱신 · 언제든 해지할 수 있어요',
    yearly: '연간',
    yearlyNote: '매년 자동 갱신 · 월 2,417원꼴',
    lifetime: '평생',
    lifetimeNote: (n: number) => `선착순 · ${n}개 남음 · 한 번 결제로 계속`,
    ranOut: '저장은 계속 돼요. AI 기능은 다음 달에 다시 생기거나, Pro로 바로 이어서 쓸 수 있어요.',
    start: 'Pro 시작하기',
    manage: '구독 관리 · 해지 (Play 스토어)',
    appOnly: '결제는 안드로이드 앱(플레이스토어에서 설치)에서 할 수 있어요.',
    preparing: '결제를 준비하고 있어요. 조금만 기다려 주세요.',
  },
  en: {
    fallback: { monthly: 'KRW 3,900/mo', yearly: 'KRW 29,000/yr', lifetime: 'KRW 39,000' },
    headlines: {
      classify: "You've used this month's AI sorting",
      search: "You've used this month's AI search",
      compose: "You've used this month's Combine",
      tag_cleanup: "You've used this month's tag tidy-ups",
      default: 'Cortex Pro',
    },
    date: (y: number, m: number, d: number) => `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]} ${d}, ${y}`,
    classifyN: (n: string) => `${n} AI sorts a month — sorted as you save`,
    classify: 'AI sorts everything as you save',
    backlogN: (n: number) => `Your ${n} Unsorted items get sorted at once`,
    backlog: 'Nothing piles up in Unsorted',
    searchN: (n: string) => `${n} AI searches a month`,
    search: 'Plenty of AI search',
    composeN: (n: string) => `Combine ${n} times a month — routes and lists by tag`,
    compose: 'Combine by tag into routes and lists',
    trial: (days: number) => `Free trial · ${days} days left`,
    lifetimePro: 'Pro for life',
    pro: (until: string | null) => `Pro${until ? ` · until ${until}` : ''}`,
    free: (cu: number, cl: number, su: number, sl: number) => `Free · this month: AI sorting ${cu}/${cl} · AI search ${su}/${sl}`,
    monthly: 'Monthly',
    monthlyNote: 'Renews monthly · cancel anytime',
    yearly: 'Yearly',
    yearlyNote: 'Renews yearly · about KRW 2,417/mo',
    lifetime: 'Lifetime',
    lifetimeNote: (n: number) => `Limited · ${n} left · pay once, keep it`,
    ranOut: 'Saving still works. AI features come back next month, or keep going now with Pro.',
    start: 'Start Pro',
    manage: 'Manage · cancel subscription (Play Store)',
    appOnly: 'You can buy Pro in the Android app (from the Play Store).',
    preparing: 'Getting checkout ready. Just a moment.',
  },
  ja: {
    fallback: { monthly: '月額 3,900ウォン', yearly: '年額 29,000ウォン', lifetime: '39,000ウォン' },
    headlines: {
      classify: '今月のAI整理を使い切りました',
      search: '今月のAI検索を使い切りました',
      compose: '今月の「まとめて作る」を使い切りました',
      tag_cleanup: '今月のタグ整理を使い切りました',
      default: 'Cortex Pro',
    },
    date: (y: number, m: number, d: number) => `${y}年${m}月${d}日`,
    classifyN: (n: string) => `AI整理 月${n}件 — 保存したらすぐ整理`,
    classify: '保存したらAIがすぐ整理します',
    backlogN: (n: number) => `未分類${n}件もまとめて整理されます`,
    backlog: '未分類にたまりません',
    searchN: (n: string) => `AI検索 月${n}回`,
    search: 'AI検索をたっぷり',
    composeN: (n: string) => `タグごとにまとめてコース・リストを作る 月${n}回`,
    compose: 'タグごとにまとめてコース・リストを作る',
    trial: (days: number) => `無料体験中 · 残り${days}日`,
    lifetimePro: 'Pro 買い切りで利用中',
    pro: (until: string | null) => `Pro利用中${until ? ` · ${until}まで` : ''}`,
    free: (cu: number, cl: number, su: number, sl: number) => `無料 · 今月のAI整理 ${cu}/${cl}件 · AI検索 ${su}/${sl}回`,
    monthly: '月額',
    monthlyNote: '毎月自動更新 · いつでも解約できます',
    yearly: '年額',
    yearlyNote: '毎年自動更新 · 月あたり約2,417ウォン',
    lifetime: '買い切り',
    lifetimeNote: (n: number) => `先着順 · 残り${n}個 · 1回の支払いでずっと`,
    ranOut: '保存はそのまま使えます。AI機能は来月また使えるようになるか、Proですぐに続けられます。',
    start: 'Proを始める',
    manage: 'サブスクの管理・解約(Play Store)',
    appOnly: '購入はAndroidアプリ(Play Storeからインストール)でできます。',
    preparing: '決済を準備しています。少々お待ちください。',
  },
  'zh-Hans': {
    fallback: { monthly: '₩3,900/月', yearly: '₩29,000/年', lifetime: '₩39,000' },
    headlines: {
      classify: '本月的 AI 整理已用完',
      search: '本月的 AI 搜索已用完',
      compose: '本月的汇总生成已用完',
      tag_cleanup: '本月的整理标签次数已用完',
      default: 'Cortex Pro',
    },
    date: (y: number, m: number, d: number) => `${y}年${m}月${d}日`,
    classifyN: (n: string) => `每月 AI 整理 ${n} 条 — 保存即整理`,
    classify: '保存后 AI 立即整理',
    backlogN: (n: number) => `${n} 条未分类也会一次整理好`,
    backlog: '不会堆在未分类里',
    searchN: (n: string) => `每月 AI 搜索 ${n} 次`,
    search: '充足的 AI 搜索',
    composeN: (n: string) => `按标签汇总生成路线、清单 每月 ${n} 次`,
    compose: '按标签汇总生成路线、清单',
    trial: (days: number) => `免费试用中 · 剩 ${days} 天`,
    lifetimePro: 'Pro 终身版使用中',
    pro: (until: string | null) => `Pro 使用中${until ? ` · 至 ${until}` : ''}`,
    free: (cu: number, cl: number, su: number, sl: number) => `免费 · 本月 AI 整理 ${cu}/${cl} 条 · AI 搜索 ${su}/${sl} 次`,
    monthly: '月付',
    monthlyNote: '每月自动续订 · 随时可取消',
    yearly: '年付',
    yearlyNote: '每年自动续订 · 约 ₩2,417/月',
    lifetime: '终身',
    lifetimeNote: (n: number) => `限量 · 剩 ${n} 份 · 一次付款永久使用`,
    ranOut: '保存照常可用。AI 功能下个月会恢复，也可以用 Pro 马上继续。',
    start: '开通 Pro',
    manage: '管理 · 取消订阅（Play Store）',
    appOnly: '请在 Android 应用（从 Play Store 安装）中付款。',
    preparing: '正在准备付款，请稍候。',
  },
  'zh-Hant': {
    fallback: { monthly: '₩3,900/月', yearly: '₩29,000/年', lifetime: '₩39,000' },
    headlines: {
      classify: '本月的 AI 整理已用完',
      search: '本月的 AI 搜尋已用完',
      compose: '本月的彙整生成已用完',
      tag_cleanup: '本月的整理標籤次數已用完',
      default: 'Cortex Pro',
    },
    date: (y: number, m: number, d: number) => `${y}年${m}月${d}日`,
    classifyN: (n: string) => `每月 AI 整理 ${n} 則 — 儲存即整理`,
    classify: '儲存後 AI 立即整理',
    backlogN: (n: number) => `${n} 則未分類也會一次整理好`,
    backlog: '不會堆在未分類裡',
    searchN: (n: string) => `每月 AI 搜尋 ${n} 次`,
    search: '充足的 AI 搜尋',
    composeN: (n: string) => `依標籤彙整生成路線、清單 每月 ${n} 次`,
    compose: '依標籤彙整生成路線、清單',
    trial: (days: number) => `免費試用中 · 剩 ${days} 天`,
    lifetimePro: 'Pro 終身版使用中',
    pro: (until: string | null) => `Pro 使用中${until ? ` · 至 ${until}` : ''}`,
    free: (cu: number, cl: number, su: number, sl: number) => `免費 · 本月 AI 整理 ${cu}/${cl} 則 · AI 搜尋 ${su}/${sl} 次`,
    monthly: '月繳',
    monthlyNote: '每月自動續訂 · 隨時可取消',
    yearly: '年繳',
    yearlyNote: '每年自動續訂 · 約 ₩2,417/月',
    lifetime: '終身',
    lifetimeNote: (n: number) => `限量 · 剩 ${n} 份 · 一次付款永久使用`,
    ranOut: '儲存照常可用。AI 功能下個月會恢復，也可以用 Pro 馬上繼續。',
    start: '開通 Pro',
    manage: '管理 · 取消訂閱（Play Store）',
    appOnly: '請在 Android 應用程式（從 Play Store 安裝）中付款。',
    preparing: '正在準備付款，請稍候。',
  },
});



function dateLabel(iso: string): string {
  const d = new Date(iso);
  return S.date(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

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
    pro ? S.classifyN(pro.classify.toLocaleString()) : S.classify,
    plan && plan.unclassifiedCount > 0 ? S.backlogN(plan.unclassifiedCount) : S.backlog,
    pro ? S.searchN(pro.search.toLocaleString()) : S.search,
    pro?.compose ? S.composeN(pro.compose.toLocaleString()) : S.compose,
  ];

  const status =
    plan?.tier === 'trial'
      ? S.trial(daysLeft(plan.trialEndsAt))
      : plan?.tier === 'pro'
        ? isLifetimePro(plan.proUntil)
          ? S.lifetimePro
          : S.pro(plan.proUntil ? dateLabel(plan.proUntil) : null)
        : plan
          ? S.free(plan.classify.used, plan.classify.limit, plan.search.used, plan.search.limit)
          : '';

  const lifetimeLeft = offers?.enabled ? offers.lifetimeRemaining : 0;
  const options: { key: PlanOption; label: string; note: string }[] = [
    { key: 'monthly', label: S.monthly, note: S.monthlyNote },
    { key: 'yearly', label: S.yearly, note: S.yearlyNote },
    ...(lifetimeLeft > 0 ? [{ key: 'lifetime' as const, label: S.lifetime, note: S.lifetimeNote(lifetimeLeft) }] : []),
  ];
  const isPro = plan?.tier === 'pro';
  const canBuy = Platform.OS === 'android' && !!offers?.enabled && !isPro;

  return (
    <ModalSheet theme={theme} onClose={close} bordered={false} paddingBottom={24} paddingHorizontal={20} maxHeightRatio={0.9}>
      {/* Title, benefits and plans scroll; the buy / close area below stays
          pinned, so a small phone never pushes the button off the sheet. */}
      <ScrollView style={styles.flexShrink} showsVerticalScrollIndicator={false}>
        <Heading theme={theme} size={24} style={styles.heading}>
          {S.headlines[reason ?? 'default']}
        </Heading>
        {reason && (
          <Text style={[styles.sub, { color: theme.sub }]}>
            {S.ranOut}
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
            (what the person will actually be charged). Hidden for someone
            already on Pro -- boxes they could tap but never buy. */}
        {!isPro && (
          <View style={styles.options}>
            {options.map((o) => {
              const active = selected === o.key;
              return (
                <Pressable
                  key={o.key}
                  onPress={() => setSelected(o.key)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  style={[styles.option, { backgroundColor: theme.surface }, frameStyle(theme), active && allEdges(2, theme.ink), { borderRadius: theme.cardRadius }]}
                >
                  <View style={styles.optionHead}>
                    <Text style={[styles.optionLabel, { color: theme.ink }]}>{o.label}</Text>
                    <Text style={[styles.optionPrice, { color: theme.ink }]}>{prices[o.key] ?? (S.fallback as Record<PlanOption, string>)[o.key]}</Text>
                  </View>
                  <Text style={[styles.optionNote, { color: theme.sub }]}>{o.note}</Text>
                </Pressable>
              );
            })}
          </View>
        )}

        {status !== '' && <Text style={[styles.status, { color: theme.sub }]}>{status}</Text>}
      </ScrollView>

      {/* Android, offers still loading: hold the buy button's place so it
          doesn't pop in late under a placeholder line. */}
      {Platform.OS === 'android' && !isPro && offers === null ? (
        <ButtonRow theme={theme} style={styles.buttons}>
          <SolidButton label={S.start} theme={theme} onPress={() => {}} loading />
        </ButtonRow>
      ) : canBuy && offers && AndroidPurchase ? (
        <AndroidPurchase theme={theme} offers={offers} selected={selected} onPrices={setPrices} onPlan={setPlan} onClose={close} />
      ) : (
        <>
          {isPro ? (
            // Where a subscription is changed or cancelled: Play, not here.
            !isLifetimePro(plan?.proUntil) && (
              <Pressable onPress={() => Linking.openURL(PLAY_SUBSCRIPTIONS_URL).catch(() => {})} hitSlop={6}>
                <Text style={[styles.status, styles.manageLink, { color: theme.ink }]}>{S.manage}</Text>
              </Pressable>
            )
          ) : (
            <Text style={[styles.status, { color: theme.sub }]}>
              {Platform.OS !== 'android'
                ? S.appOnly
                : S.preparing}
            </Text>
          )}
          <ButtonRow theme={theme} style={styles.buttons}>
            <SolidButton label={COMMON.close} theme={theme} onPress={close} />
          </ButtonRow>
        </>
      )}
    </ModalSheet>
  );
}

const styles = StyleSheet.create({
  flexShrink: { flexShrink: 1 },
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
  manageLink: { fontFamily: 'IBMPlexSansKR_500Medium', textDecorationLine: 'underline' },
});
