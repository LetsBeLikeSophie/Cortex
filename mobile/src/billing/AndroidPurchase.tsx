import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { isUserCancelledError, useIAP, type Purchase } from 'expo-iap';

import { Theme } from '../theme/themes';
import { classifyBacklog, friendlyError, Offers, Plan, verifyGooglePurchase } from '../api/client';
import { ButtonRow, SolidButton } from '../components/Buttons';
import { showToast } from '../native/toast';

import type { PlanOption, StorePrices } from './types';

// Base plan ids under the one subscription product in Play Console
// (Monetize > Subscriptions > cortex_pro).
const BASE_PLAN: Record<'monthly' | 'yearly', string> = { monthly: 'monthly', yearly: 'yearly' };

// The Google Play part of the paywall, mounted only on Android when the
// server says billing is set up (expo-iap has no web implementation).
// Flow: load the products -> person picks a plan -> Play's own purchase
// sheet -> on success the purchase token goes to our server, which checks
// it with Google, acknowledges it and turns Pro on -> finishTransaction.
export function AndroidPurchase({
  theme,
  offers,
  selected,
  onPrices,
  onPlan,
  onClose,
}: {
  theme: Theme;
  offers: Offers;
  selected: PlanOption;
  onPrices: (prices: StorePrices) => void;
  onPlan: (plan: Plan) => void;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const confirmWithServer = async (purchase: Purchase): Promise<Plan | null> => {
    const token = purchase.purchaseToken;
    if (!token) return null;
    const plan = await verifyGooglePurchase(purchase.productId, token);
    await finishTransaction({ purchase, isConsumable: false }).catch(() => {});
    onPlan(plan);
    return plan;
  };

  // The paywall promised '미분류함 N건도 한 번에 정리돼요' -- so once Pro is
  // on, start that right away and say so.
  const announcePro = async (plan: Plan | null, first: string) => {
    const waiting = plan?.unclassifiedCount ?? 0;
    if (waiting === 0) {
      showToast(first);
      return;
    }
    try {
      const { started } = await classifyBacklog();
      showToast(`${first} · 미분류 ${started}건 정리를 시작했어요`);
    } catch {
      showToast(`${first} · 미분류함에서 'AI로 정리'를 눌러 주세요`);
    }
  };

  const { connected, subscriptions, products, fetchProducts, requestPurchase, finishTransaction, getAvailablePurchases, availablePurchases } =
    useIAP({
      onPurchaseSuccess: (purchase) => {
        confirmWithServer(purchase)
          .then((plan) => announcePro(plan, 'Pro가 시작됐어요'))
          .then(() => onClose())
          .catch((err) => setError(friendlyError(err)))
          .finally(() => setBusy(false));
      },
      onPurchaseError: (err) => {
        setBusy(false);
        if (!isUserCancelledError(err)) setError(err.message || '결제를 마치지 못했어요');
      },
    });

  useEffect(() => {
    if (!connected) return;
    fetchProducts({ skus: [offers.subscriptionId], type: 'subs' }).catch(() => {});
    fetchProducts({ skus: [offers.lifetimeId], type: 'in-app' }).catch(() => {});
  }, [connected, offers.subscriptionId, offers.lifetimeId, fetchProducts]);

  const sub = subscriptions.find((s) => s.id === offers.subscriptionId);
  const offerFor = (plan: 'monthly' | 'yearly') =>
    sub && 'subscriptionOffers' in sub ? (sub.subscriptionOffers ?? []).find((o) => o.basePlanIdAndroid === BASE_PLAN[plan] && !o.id) ?? (sub.subscriptionOffers ?? []).find((o) => o.basePlanIdAndroid === BASE_PLAN[plan]) : undefined;
  const lifetime = products.find((p) => p.id === offers.lifetimeId);

  useEffect(() => {
    const monthly = offerFor('monthly');
    const yearly = offerFor('yearly');
    onPrices({
      ...(monthly ? { monthly: `월 ${monthly.displayPrice}` } : null),
      ...(yearly ? { yearly: `연 ${yearly.displayPrice}` } : null),
      ...(lifetime ? { lifetime: lifetime.displayPrice } : null),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sub, lifetime]);

  const buy = async () => {
    setError('');
    try {
      if (selected === 'lifetime') {
        if (!lifetime) throw new Error('평생권 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');
        setBusy(true);
        await requestPurchase({ type: 'in-app', request: { google: { skus: [offers.lifetimeId] } } });
      } else {
        const offer = offerFor(selected);
        if (!offer?.offerTokenAndroid) throw new Error('구독 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');
        setBusy(true);
        await requestPurchase({
          type: 'subs',
          request: { google: { skus: [offers.subscriptionId], subscriptionOffers: [{ sku: offers.subscriptionId, offerToken: offer.offerTokenAndroid }] } },
        });
      }
    } catch (err) {
      setBusy(false);
      if (!isUserCancelledError(err)) setError(err instanceof Error ? err.message : friendlyError(err));
    }
  };

  // Re-sends whatever Play says this Google account already owns -- for a
  // reinstall, a second device, or a purchase whose confirmation was lost.
  const [restoring, setRestoring] = useState(false);
  const restore = async () => {
    setError('');
    setRestoring(true);
    try {
      await getAvailablePurchases();
    } catch (err) {
      setError(friendlyError(err));
      setRestoring(false);
    }
  };
  useEffect(() => {
    if (!restoring) return;
    const mine = availablePurchases.filter((p) => p.productId === offers.subscriptionId || p.productId === offers.lifetimeId);
    if (mine.length === 0) {
      setRestoring(false);
      setError('이 구글 계정으로 산 Pro가 없어요.');
      return;
    }
    Promise.all(mine.map(confirmWithServer))
      .then((plans) => announcePro(plans.filter(Boolean).pop() ?? null, 'Pro를 복원했어요'))
      .then(() => onClose())
      .catch((err) => setError(friendlyError(err)))
      .finally(() => setRestoring(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availablePurchases]);

  return (
    <View>
      {error !== '' && <Text style={[styles.error, { color: theme.danger }]}>{error}</Text>}
      <ButtonRow theme={theme} style={styles.buttons}>
        <SolidButton label={connected ? 'Pro 시작하기' : '스토어 연결 중...'} theme={theme} onPress={buy} loading={busy} disabled={!connected} />
      </ButtonRow>
      <Pressable onPress={restore} disabled={restoring} hitSlop={8} style={styles.restore}>
        {restoring ? (
          <ActivityIndicator size="small" color={theme.sub} />
        ) : (
          <Text style={[styles.restoreText, { color: theme.sub }]}>구매 복원</Text>
        )}
      </Pressable>
      <Text style={[styles.fine, { color: theme.sub }]}>
        Google Play로 결제돼요. 해지 전까지 자동 갱신되고, Play 스토어에서 해지할 수 있어요.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  error: { fontSize: 12.5, marginTop: 12, paddingHorizontal: 4, fontFamily: 'IBMPlexSansKR_400Regular' },
  buttons: { marginTop: 16 },
  restore: { alignSelf: 'center', marginTop: 12, paddingVertical: 4 },
  restoreText: { fontSize: 12.5, textDecorationLine: 'underline', fontFamily: 'IBMPlexSansKR_400Regular' },
  fine: { fontSize: 11.5, lineHeight: 17, marginTop: 10, paddingHorizontal: 4, fontFamily: 'IBMPlexSansKR_400Regular' },
});
