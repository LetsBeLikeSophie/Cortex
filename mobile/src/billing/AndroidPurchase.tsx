import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  finishTransaction as finishPurchase,
  getAvailablePurchases as listOwnedPurchases,
  initConnection,
  isUserCancelledError,
  useIAP,
  type Purchase,
} from 'expo-iap';

import { Theme, BODY_KR } from '../theme/themes';
import { ApiError, classifyBacklog, fetchOffers, friendlyError, Offers, Plan, verifyGooglePurchase, logAppEvent } from '../api/client';
import { ButtonRow, SolidButton } from '../components/Buttons';
import { showToast } from '../native/toast';

import type { PlanOption, StorePrices } from './types';
import { LANG, TERMS_URL, TOKUSHOHO_URL, strings } from '../i18n';

const S = strings({
  ko: {
    backlogStarted: (first: string, n: number) => `${first} · 미분류 ${n}건 정리를 시작했어요`,
    backlogManual: (first: string) => `${first} · 미분류함에서 'AI로 정리'를 눌러 주세요`,
    started: 'Pro가 시작됐어요',
    purchaseFailed: '결제를 마치지 못했어요',
    perMonth: (price: string) => `월 ${price}`,
    perYear: (price: string) => `연 ${price}`,
    noLifetime: '평생권 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.',
    noSub: '구독 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.',
    nothingToRestore: '이 구글 계정으로 산 Pro가 없어요.',
    restored: 'Pro를 복원했어요',
    start: 'Pro 시작하기',
    connecting: '스토어 연결 중...',
    restore: '구매 복원',
    fine: 'Google Play로 결제돼요. 해지 전까지 자동 갱신되고, Play 스토어에서 해지할 수 있어요. 결제 후 7일 안에 Pro로 늘어난 기능을 쓰지 않았다면 환불할 수 있어요.',
    terms: '약관',
  },
  en: {
    backlogStarted: (first: string, n: number) => `${first} · Sorting ${n} memo${n === 1 ? '' : 's'} in Unsorted`,
    backlogManual: (first: string) => `${first} · Tap 'Sort with AI' in Unsorted`,
    started: 'Pro is on',
    purchaseFailed: "Couldn't complete the purchase",
    perMonth: (price: string) => `${price}/mo`,
    perYear: (price: string) => `${price}/yr`,
    noLifetime: "Couldn't load the lifetime plan. Please try again shortly.",
    noSub: "Couldn't load the subscription. Please try again shortly.",
    nothingToRestore: 'No Pro purchase found for this Google account.',
    restored: 'Pro restored',
    start: 'Start Pro',
    connecting: 'Connecting to store...',
    restore: 'Restore purchase',
    fine: 'Billed through Google Play. Renews automatically until you cancel, which you can do in the Play Store. Refundable within 7 days if you haven\'t used what Pro adds.',
    terms: 'Terms',
  },
  ja: {
    backlogStarted: (first: string, n: number) => `${first} · 未分類${n}件の整理を始めました`,
    backlogManual: (first: string) => `${first} · 未分類で「AIで整理」を押してください`,
    started: 'Proが始まりました',
    purchaseFailed: '購入を完了できませんでした',
    perMonth: (price: string) => `月額 ${price}`,
    perYear: (price: string) => `年額 ${price}`,
    noLifetime: '買い切りプランを読み込めませんでした。しばらくしてからもう一度お試しください。',
    noSub: 'サブスクリプション情報を読み込めませんでした。しばらくしてからもう一度お試しください。',
    nothingToRestore: 'このGoogleアカウントで購入したProはありません。',
    restored: 'Proを復元しました',
    start: 'Proを始める',
    connecting: 'ストアに接続中...',
    restore: '購入を復元',
    fine: 'Google Playで決済されます。解約するまで自動更新され、Play Storeで解約できます。決済後7日以内にProの追加機能を使っていなければ返金できます。',
    terms: '利用規約',
  },
  'zh-Hans': {
    backlogStarted: (first: string, n: number) => `${first} · 已开始整理 ${n} 条未分类`,
    backlogManual: (first: string) => `${first} · 请在“未分类”中点按“用 AI 整理”`,
    started: 'Pro 已开通',
    purchaseFailed: '未能完成付款',
    perMonth: (price: string) => `${price}/月`,
    perYear: (price: string) => `${price}/年`,
    noLifetime: '无法加载终身版信息，请稍后再试。',
    noSub: '无法加载订阅信息，请稍后再试。',
    nothingToRestore: '这个 Google 账号没有购买过 Pro。',
    restored: '已恢复 Pro',
    start: '开通 Pro',
    connecting: '正在连接商店...',
    restore: '恢复购买',
    fine: '通过 Google Play 付款。取消前会自动续订，可在 Play 商店中取消。付款后 7 天内未使用 Pro 增加的功能可退款。',
    terms: '条款',
  },
  'zh-Hant': {
    backlogStarted: (first: string, n: number) => `${first} · 已開始整理 ${n} 則未分類`,
    backlogManual: (first: string) => `${first} · 請在「未分類」中點按「用 AI 整理」`,
    started: 'Pro 已開通',
    purchaseFailed: '未能完成付款',
    perMonth: (price: string) => `${price}/月`,
    perYear: (price: string) => `${price}/年`,
    noLifetime: '無法載入終身版資訊，請稍後再試。',
    noSub: '無法載入訂閱資訊，請稍後再試。',
    nothingToRestore: '這個 Google 帳號沒有購買過 Pro。',
    restored: '已還原 Pro',
    start: '開通 Pro',
    connecting: '正在連線商店...',
    restore: '還原購買',
    fine: '透過 Google Play 付款。取消前會自動續訂，可在 Play 商店中取消。付款後 7 天內未使用 Pro 增加的功能可退款。',
    terms: '條款',
  },
});

// Base plan ids under the one subscription product in Play Console
// (Monetize > Subscriptions > cortex_pro).
const BASE_PLAN: Record<'monthly' | 'yearly', string> = { monthly: 'monthly', yearly: 'yearly' };

// The purchase is already paid for when this runs, so a dropped connection or
// a restarting server gets more tries. A refusal (400, 409) stays one.
const VERIFY_RETRY_MS = [2000, 5000];
async function verifyWithRetry(productId: string, token: string): Promise<Plan> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await verifyGooglePurchase(productId, token);
    } catch (err) {
      const refused = err instanceof ApiError && err.status < 500 && err.status !== 429;
      if (refused || attempt >= VERIFY_RETRY_MS.length) throw err;
      await new Promise((resolve) => setTimeout(resolve, VERIFY_RETRY_MS[attempt]));
    }
  }
}

// Paid, but the server never heard (no signal, the app closed): Play refunds
// anything left unacknowledged for 3 days. Whatever Play still holds that way
// goes to the server now. Only unacknowledged ones: an acknowledged purchase
// already has an account, and 구매 복원 is the way to move it. The connection
// stays open, since closing it would cut off a paywall opened meanwhile.
async function confirmWaitingPurchases(): Promise<Plan | null> {
  const offers = await fetchOffers();
  if (!offers.enabled || !(await initConnection())) return null;
  const owned = await listOwnedPurchases();
  let plan: Plan | null = null;
  for (const purchase of owned) {
    const ours = purchase.productId === offers.subscriptionId || purchase.productId === offers.lifetimeId;
    const waiting = 'isAcknowledgedAndroid' in purchase && purchase.isAcknowledgedAndroid === false && purchase.purchaseState === 'purchased';
    if (!ours || !waiting || !purchase.purchaseToken) continue;
    try {
      plan = await verifyWithRetry(purchase.productId, purchase.purchaseToken);
      await finishPurchase({ purchase, isConsumable: false }).catch(() => {});
    } catch {
      // Another account's (409), or still unreachable: the next check retries.
    }
  }
  return plan;
}

const RESCUE_EVERY_MS = 5 * 60 * 1000;
let lastRescueAt = 0;

// No screen: runs on app open and again when the plan refreshes, while this
// person isn't Pro.
export function PurchaseRescue({ plan, onPlan }: { plan: Plan | null; onPlan: (plan: Plan) => void }) {
  useEffect(() => {
    if (!plan || plan.tier === 'pro' || Date.now() - lastRescueAt < RESCUE_EVERY_MS) return;
    lastRescueAt = Date.now();
    confirmWaitingPurchases()
      .then((next) => {
        if (!next) return;
        onPlan(next);
        if (next.tier === 'pro') showToast(S.started);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan]);
  return null;
}

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
    const plan = await verifyWithRetry(purchase.productId, token);
    await finishTransaction({ purchase, isConsumable: false }).catch(() => {});
    onPlan(plan);
    return plan;
  };

  // The paywall promised '미분류함 N건도 한 번에 정리돼요' -- so once Pro is
  // on, start that right away and say so.
  const announcePro = async (plan: Plan | null, first: string) => {
    const waiting = plan?.backlogCount ?? plan?.unclassifiedCount ?? 0;
    if (waiting === 0) {
      showToast(first);
      return;
    }
    try {
      const { started } = await classifyBacklog();
      showToast(S.backlogStarted(first, started));
    } catch {
      showToast(S.backlogManual(first));
    }
  };

  const { connected, subscriptions, products, fetchProducts, requestPurchase, finishTransaction, getAvailablePurchases, availablePurchases } =
    useIAP({
      onPurchaseSuccess: (purchase) => {
        confirmWithServer(purchase)
          .then((plan) => announcePro(plan, S.started))
          .then(() => onClose())
          .catch((err) => setError(friendlyError(err)))
          .finally(() => setBusy(false));
      },
      onPurchaseError: (err) => {
        setBusy(false);
        if (!isUserCancelledError(err)) setError(err.message || S.purchaseFailed);
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
      ...(monthly ? { monthly: S.perMonth(monthly.displayPrice) } : null),
      ...(yearly ? { yearly: S.perYear(yearly.displayPrice) } : null),
      ...(lifetime ? { lifetime: lifetime.displayPrice } : null),
      ...(monthly?.price && yearly?.price ? { yearlySave: Math.floor((1 - yearly.price / (monthly.price * 12)) * 100) } : null),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sub, lifetime]);

  const buy = async () => {
    setError('');
    logAppEvent('purchase_started', selected);
    try {
      if (selected === 'lifetime') {
        if (!lifetime) throw new Error(S.noLifetime);
        setBusy(true);
        await requestPurchase({ type: 'in-app', request: { google: { skus: [offers.lifetimeId] } } });
      } else {
        const offer = offerFor(selected);
        if (!offer?.offerTokenAndroid) throw new Error(S.noSub);
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
      setError(S.nothingToRestore);
      return;
    }
    Promise.all(mine.map(confirmWithServer))
      .then((plans) => announcePro(plans.filter(Boolean).pop() ?? null, S.restored))
      .then(() => onClose())
      .catch((err) => setError(friendlyError(err)))
      .finally(() => setRestoring(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availablePurchases]);

  return (
    <View>
      {error !== '' && <Text style={[styles.error, { color: theme.danger }]}>{error}</Text>}
      <ButtonRow theme={theme} style={styles.buttons}>
        <SolidButton label={connected ? S.start : S.connecting} theme={theme} onPress={buy} loading={busy} disabled={!connected} />
      </ButtonRow>
      <Pressable onPress={restore} disabled={restoring} hitSlop={8} style={styles.restore}>
        {restoring ? (
          <ActivityIndicator size="small" color={theme.sub} />
        ) : (
          <Text style={[styles.restoreText, { color: theme.sub }]}>{S.restore}</Text>
        )}
      </Pressable>
      <Text style={[styles.fine, { color: theme.sub }]}>
        {S.fine}{' '}
        <Text style={styles.fineLink} onPress={() => Linking.openURL(TERMS_URL).catch(() => {})}>
          {S.terms}
        </Text>
        {LANG === 'ja' && (
          <>
            {' · '}
            <Text style={styles.fineLink} onPress={() => Linking.openURL(TOKUSHOHO_URL).catch(() => {})}>
              特定商取引法に基づく表記
            </Text>
          </>
        )}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  error: { fontSize: 12.5, marginTop: 12, paddingHorizontal: 4, fontFamily: BODY_KR },
  buttons: { marginTop: 16 },
  restore: { alignSelf: 'center', marginTop: 12, paddingVertical: 4 },
  restoreText: { fontSize: 12.5, textDecorationLine: 'underline', fontFamily: BODY_KR },
  fineLink: { textDecorationLine: 'underline' },
  fine: { fontSize: 11.5, lineHeight: 17, marginTop: 10, paddingHorizontal: 4, fontFamily: BODY_KR },
});
