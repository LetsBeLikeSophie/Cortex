import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useTheme } from '../theme/ThemeContext';
import { allEdges, BODY_KR, BODY_KR_MEDIUM } from '../theme/themes';
import { frameStyle } from '../components/Card';
import { fetchOffers, fetchPlan, Offers, Plan, logAppEvent } from '../api/client';
import { ModalSheet } from '../components/ModalSheet';
import { SheetTitle } from '../components/Typography';
import { ButtonRow, SolidButton } from '../components/Buttons';
import { CheckIcon } from '../components/Icons';
import { freeRunsOutDay } from '../billing/trialPace';
import { PLAY_SUBSCRIPTIONS_URL, isLifetimePro } from '../billing/types';
import type { PlanOption, StorePrices } from '../billing/types';
import type { RootStackParamList } from '../navigation/types';
import { COMMON } from '../i18n/common';
import { S } from './PaywallScreen.strings';

// Cortex Pro. Opened when a metered AI feature runs out (미분류함, AI
// search, 모아서 만들기) or from the profile. The benefits state Pro's real
// monthly ceilings (from /me/plan). Buying goes through Google Play in the
// Android app (billing/AndroidPurchase); the web shows the plans but points
// to the app until a web checkout exists.
// expo-iap is native-only -- required on Android alone so the web bundle
// never loads it (same pattern as native/mediaLibrary).
const AndroidPurchase: typeof import('../billing/AndroidPurchase').AndroidPurchase | null =
  Platform.OS === 'android' ? require('../billing/AndroidPurchase').AndroidPurchase : null;
const RestorePurchase: typeof import('../billing/AndroidPurchase').RestorePurchase | null =
  Platform.OS === 'android' ? require('../billing/AndroidPurchase').RestorePurchase : null;



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
  const [selected, setSelected] = useState<PlanOption | null>(null);
  const [prices, setPrices] = useState<StorePrices>({});

  useEffect(() => {
    fetchPlan()
      .then(setPlan)
      .catch(() => {});
    fetchOffers()
      .then(setOffers)
      // Unreachable: the screen still opens, with buying off.
      .catch(() => setOffers({ enabled: false, subscriptionId: '', lifetimeId: '', lifetimeRemaining: 0 }));
  }, []);

  // Back from Play (cancel, resume) the plan is read again, so the screen
  // doesn't keep saying "다음 결제" after a cancel (Sophie 11-12 test). Play's
  // notice can reach the server a few seconds later, hence the second read.
  useEffect(() => {
    let later: ReturnType<typeof setTimeout> | undefined;
    const sub = AppState.addEventListener('change', (st) => {
      if (st !== 'active') return;
      const read = () => fetchPlan().then(setPlan).catch(() => {});
      read();
      clearTimeout(later);
      later = setTimeout(read, 5000);
    });
    return () => {
      sub.remove();
      clearTimeout(later);
    };
  }, []);

  useEffect(() => {
    logAppEvent('paywall_view', reason ?? 'default');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const close = () => navigation.goBack();

  const pro = plan?.proLimits;
  const backlogCount = plan?.backlogCount ?? plan?.unclassifiedCount ?? 0;
  const benefits = [
    pro ? S.classifyN(pro.classify.toLocaleString()) : S.classify,
    backlogCount > 0 ? S.backlogN(backlogCount) : S.backlog,
    pro ? S.searchN(pro.search.toLocaleString()) : S.search,
    pro?.compose ? S.composeN(pro.compose.toLocaleString()) : S.compose,
    // Opened because tag cleanup ran out: say what Pro gives for it (only
    // then, so the usual card keeps its four lines).
    ...(reason === 'tag_cleanup' && pro?.tag_cleanup ? [S.tagCleanupN(pro.tag_cleanup.toLocaleString())] : []),
    ...(reason === 'tag_lock' ? [S.tagLocks] : []),
  ];

  // Read at render: the strings follow the language picked in the app.
  const PLAN_LABELS: Record<PlanOption, string> = { monthly: S.monthly, yearly: S.yearly, lifetime: S.lifetime };
  const sub = plan?.subscription;
  // Trial just ended: what the trial was used for, and when free would run
  // out at that pace, instead of a freshly reset 0/50 (decision 11-04 B2).
  const trialStats = reason === 'trial_ended' && plan?.tier === 'free' && plan.trialStats && plan.trialStats.saved > 0 ? plan.trialStats : null;
  const runsOutDay = trialStats && plan ? freeRunsOutDay(trialStats.saved, trialStats.days, plan.classify.limit) : null;
  const paymentIssue = sub?.status === 'payment_issue';
  const status =
    paymentIssue
      ? S.paymentIssue
      : plan?.tier === 'trial'
      ? S.trial(daysLeft(plan.trialEndsAt))
      : plan?.tier === 'pro'
        ? isLifetimePro(plan.proUntil)
          ? S.lifetimePro
          : sub?.status === 'renewing'
            ? S.renews(dateLabel(sub.until))
            : sub?.status === 'ending'
              ? S.ending(dateLabel(sub.until), sub.plan === 'monthly' || sub.plan === 'yearly' ? PLAN_LABELS[sub.plan] : undefined)
              : S.pro(plan.proUntil ? dateLabel(plan.proUntil) : null)
        : trialStats
          ? S.trialStats(trialStats.days, trialStats.saved, trialStats.searched)
          : plan
            ? S.free(plan.classify.used, plan.classify.limit, plan.search.used, plan.search.limit)
            : '';

  const trialReason = reason === 'trial_ending' || reason === 'trial_ended';
  const subline = trialStats
    ? runsOutDay
      ? S.trialPace(runsOutDay)
      : S.trialEnough
    : trialReason
    ? (reason === 'trial_ending' && plan && plan.classify.used > 0 ? `${S.trialUsed(plan.classify.used)} · ` : '') + S.trialSafe
    : reason
      ? S.ranOut
      : S.promise;

  const lifetimeLeft = offers?.enabled ? offers.lifetimeRemaining : 0;
  const options: { key: PlanOption; label: string; note: string }[] = [
    { key: 'monthly', label: S.monthly, note: S.monthlyNote },
    { key: 'yearly', label: S.yearly, note: S.yearlyNote(prices.yearlySave) },
    ...(lifetimeLeft > 0 ? [{ key: 'lifetime' as const, label: S.lifetime, note: S.lifetimeNote(lifetimeLeft) }] : []),
  ];
  const isPro = plan?.tier === 'pro';
  // Nothing is drawn until both the plan and (Android) the store offers are
  // known, so the screen never shows one state and then turns into another
  // (Sophie 11-11).
  const ready = plan !== null && (Platform.OS !== 'android' || offers !== null);
  // What the person has now (Sophie 11-11):
  // - renewing monthly / yearly: that plan is marked as current and selected;
  //   picking another switches to it.
  // - cancelled but still running: nothing marked or selected, the status
  //   says which plan runs until when; picking its plan resubscribes (Play),
  //   another switches.
  // - lifetime: lifetime alone, read-only.
  const subPlan = sub && (sub.status === 'renewing' || sub.status === 'ending') && (sub.plan === 'monthly' || sub.plan === 'yearly') ? sub.plan : null;
  const ending = isPro && sub?.status === 'ending' && subPlan !== null;
  const lifetimePro = isPro && isLifetimePro(plan?.proUntil);
  const currentPlan: PlanOption | null = !isPro ? null : lifetimePro ? 'lifetime' : sub?.status === 'renewing' ? subPlan : null;
  // A held payment is fixed in Play, not by buying again.
  const canBuy = Platform.OS === 'android' && !!offers?.enabled && !isPro && !paymentIssue;
  const canChange = Platform.OS === 'android' && !!offers?.enabled && !paymentIssue && !lifetimePro && subPlan !== null;
  const pickable = !isPro || canChange;
  const shownOptions = lifetimePro ? [{ key: 'lifetime' as const, label: S.lifetime, note: '' }] : options;
  // The first selection, once: the plan in use, nothing when cancelled,
  // yearly for someone choosing for the first time.
  const initialized = useRef(false);
  useEffect(() => {
    if (!ready || initialized.current) return;
    initialized.current = true;
    setSelected(currentPlan ?? (isPro ? null : 'yearly'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);
  // A change button stands where the close button would (Sophie 11-11).
  const actionShown = canChange && selected !== null && (selected !== currentPlan || ending);

  return (
    <ModalSheet theme={theme} onClose={close} bordered={false} paddingBottom={24} paddingHorizontal={20} maxHeightRatio={0.9}>
      {/* Title, benefits and plans scroll; the buy / close area below stays
          pinned, so a small phone never pushes the button off the sheet. */}
      <ScrollView style={styles.flexShrink} showsVerticalScrollIndicator={false}>
        <SheetTitle theme={theme} title={S.headlines[reason ?? 'default']} sub={subline} />

        {!ready ? (
          <View style={styles.loading}>
            <ActivityIndicator color={theme.sub} />
          </View>
        ) : (
        <>
        <View style={[styles.card, { backgroundColor: theme.surface, ...frameStyle(theme), borderRadius: theme.cardRadius }]}>
          {/* Under the plain 'Cortex Pro' title a second 'Pro' only repeats it
              and pushes the plans below the fold (Sophie 11-12). */}
          {reason && <Text style={[styles.planName, { color: theme.ink }]}>Pro</Text>}
          {benefits.map((b) => (
            <View key={b} style={styles.benefit}>
              <View style={styles.benefitIcon}>
                <CheckIcon size={16} color={theme.accent} strokeWidth={2} />
              </View>
              <Text style={[styles.benefitText, { color: theme.ink }]}>{b}</Text>
            </View>
          ))}
        </View>

        {/* The plans. Prices come from Google Play once the store answers
            (what the person will actually be charged). Shown only once the
            plan is known, so a Pro member never sees them flash as buyable;
            on Pro they're read-only with the current one marked. */}
        {(!isPro || currentPlan !== null || ending) && (
          <View style={styles.options}>
            {shownOptions.map((o) => {
              const active = selected === o.key;
              return (
                <Pressable
                  key={o.key}
                  onPress={pickable ? () => setSelected(o.key) : undefined}
                  disabled={!pickable}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active, disabled: !pickable }}
                  style={[styles.option, { backgroundColor: theme.surface }, frameStyle(theme), active && allEdges(2, theme.ink), { borderRadius: theme.cardRadius }]}
                >
                  <View style={styles.optionHead}>
                    <Text style={[styles.optionLabel, { color: theme.ink }]}>
                      {o.label}
                      {o.key === currentPlan ? <Text style={[styles.optionNote, { color: theme.sub }]}>{`  ${S.currentPlan}`}</Text> : null}
                    </Text>
                    {/* Lifetime Pro doesn't ask the store for prices; a fallback in won would be wrong abroad. */}
                    {pickable && <Text style={[styles.optionPrice, { color: theme.ink }]}>{prices[o.key] ?? (S.fallback as Record<PlanOption, string>)[o.key]}</Text>}
                  </View>
                  {o.note !== '' && pickable && <Text style={[styles.optionNote, { color: theme.sub }]}>{o.note}</Text>}
                </Pressable>
              );
            })}
          </View>
        )}

        {status !== '' && <Text style={[styles.status, { color: theme.sub }]}>{status}</Text>}
        </>
        )}
      </ScrollView>

      {/* Android, offers still loading: hold the buy button's place so it
          doesn't pop in late under a placeholder line. */}
      {/* Plan not known yet either: a Pro member mustn't see 'Pro 시작하기' flash first (Sophie 11-10). */}
      {!ready ? null : canBuy && offers && AndroidPurchase ? (
        <AndroidPurchase theme={theme} offers={offers} selected={selected} planLabels={PLAN_LABELS} onPrices={setPrices} onPlan={setPlan} onClose={close} />
      ) : (
        <>
          {canChange && offers && AndroidPurchase && (
            <AndroidPurchase theme={theme} offers={offers} selected={selected} current={subPlan} ending={ending} planLabels={PLAN_LABELS} onPrices={setPrices} onPlan={setPlan} onClose={close} />
          )}
          {isPro || paymentIssue ? (
            // Cancelling or fixing a payment happens in Play. A cancelled one
            // has nothing to cancel; resubscribing is a plan pick above.
            !lifetimePro && !ending && (
              <Pressable onPress={() => Linking.openURL(PLAY_SUBSCRIPTIONS_URL).catch(() => {})} hitSlop={6}>
                <Text style={[styles.status, styles.manageLink, { color: theme.ink }]}>{paymentIssue ? S.fixPayment : S.manage}</Text>
              </Pressable>
            )
          ) : (
            <Text style={[styles.status, { color: theme.sub }]}>
              {Platform.OS !== 'android'
                ? S.appOnly
                : S.preparing}
            </Text>
          )}
          {!actionShown && (
            <ButtonRow theme={theme} style={styles.buttons}>
              <SolidButton label={COMMON.close} theme={theme} onPress={close} />
            </ButtonRow>
          )}
          {/* A held payment hides buying, not restoring (S-1). */}
          {paymentIssue && offers?.enabled && RestorePurchase && <RestorePurchase theme={theme} offers={offers} onPlan={setPlan} onClose={close} />}
        </>
      )}
    </ModalSheet>
  );
}

const styles = StyleSheet.create({
  flexShrink: { flexShrink: 1 },
  card: { padding: 18, marginTop: 18, gap: 12 },
  // Icon on the first line when the text wraps (rule 2026-10-26).
  planName: { fontSize: 20, fontFamily: BODY_KR_MEDIUM, marginBottom: 2 },
  benefit: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  benefitIcon: { marginTop: 2 },
  benefitText: { flex: 1, fontSize: 14, lineHeight: 20, fontFamily: BODY_KR },
  options: { gap: 8, marginTop: 14 },
  option: { paddingHorizontal: 16, paddingVertical: 12 },
  optionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  optionLabel: { fontSize: 15, fontFamily: BODY_KR_MEDIUM },
  optionPrice: { fontSize: 15, fontFamily: BODY_KR_MEDIUM },
  optionNote: { fontSize: 12.5, marginTop: 3, fontFamily: BODY_KR },
  loading: { paddingVertical: 48, alignItems: 'center' },
  status: { fontSize: 12.5, marginTop: 12, paddingHorizontal: 4, fontFamily: BODY_KR },
  buttons: { marginTop: 18 },
  manageLink: { fontFamily: BODY_KR_MEDIUM, textDecorationLine: 'underline' },
});
