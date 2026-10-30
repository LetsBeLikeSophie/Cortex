import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';

import { fetchLookback, type Plan } from '../api/client';
import { strings } from '../i18n';

// The app speaks first, two ways (decision B3, C, 2026-10-29), both local
// notifications scheduled on this phone -- nothing goes to a server:
// - monthly: the 1st, when the AI quota refills, only while 미분류함 has
//   something waiting;
// - weekly: '다시 보기', three older memos.
// Each can be turned off in 내 계정. Android asks for the permission once,
// a week after the app was first opened.

const S = strings({
  ko: {
    channel: '알림',
    monthlyTitle: 'AI 정리가 다시 채워졌어요',
    monthlyBody: (n: number) => `미분류 ${n}건 · 지금 정리해 보세요`,
    weeklyTitle: '다시 보기',
  },
  en: {
    channel: 'Reminders',
    monthlyTitle: 'AI sorting is refilled',
    monthlyBody: (n: number) => `${n} unsorted · sort them now`,
    weeklyTitle: 'Look back',
  },
  ja: {
    channel: 'お知らせ',
    monthlyTitle: 'AI整理が補充されました',
    monthlyBody: (n: number) => `未分類 ${n}件 · 今すぐ整理`,
    weeklyTitle: 'ふりかえり',
  },
  'zh-Hans': {
    channel: '提醒',
    monthlyTitle: 'AI 整理次数已恢复',
    monthlyBody: (n: number) => `未分类 ${n} 条 · 现在整理`,
    weeklyTitle: '回顾',
  },
  'zh-Hant': {
    channel: '提醒',
    monthlyTitle: 'AI 整理次數已恢復',
    monthlyBody: (n: number) => `未分類 ${n} 則 · 現在整理`,
    weeklyTitle: '回顧',
  },
});

export type ReminderKind = 'monthly' | 'weekly';

const SUPPORTED = Platform.OS === 'android';
const CHANNEL = 'reminders';
const FIRST_SEEN_KEY = 'reminders.firstSeen';
const ASKED_KEY = 'reminders.asked';
const SYNCED_KEY = 'reminders.syncedOn';
const offKey = (kind: ReminderKind) => `reminders.${kind}.off`;
const ASK_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

export const REMINDERS_SUPPORTED = SUPPORTED;

export async function reminderOn(kind: ReminderKind): Promise<boolean> {
  return (await AsyncStorage.getItem(offKey(kind)).catch(() => null)) !== '1';
}

export async function notificationsAllowed(): Promise<boolean> {
  if (!SUPPORTED) return false;
  return (await Notifications.getPermissionsAsync()).granted;
}

// Asks the system (it shows its own prompt only while it still can).
// Returns whether notifications are allowed, and whether asking again
// would show anything.
export async function askNotifications(): Promise<{ granted: boolean; canAskAgain: boolean }> {
  await AsyncStorage.setItem(ASKED_KEY, '1').catch(() => {});
  const res = await Notifications.requestPermissionsAsync();
  return { granted: res.granted, canAskAgain: res.canAskAgain };
}

export async function setReminderOn(kind: ReminderKind, on: boolean) {
  if (on) await AsyncStorage.removeItem(offKey(kind)).catch(() => {});
  else {
    await AsyncStorage.setItem(offKey(kind), '1').catch(() => {});
    await Notifications.cancelScheduledNotificationAsync(kind).catch(() => {});
  }
}

// What the monthly reminder counts: only free accounts that agreed to AI
// get a refill to hear about; for everyone else it's 0 (no reminder).
export function refillCount(plan: Plan): number {
  return plan.tier === 'free' && plan.aiConsent === 'agreed' ? plan.unclassifiedCount : 0;
}

// Called with each Home refresh; re-plans both notifications from what's
// on the server, at most once a day (`force` after a setting changes), so
// the count and the memos are recent ones.
export async function syncReminders(unclassifiedCount: number, force = false) {
  if (!SUPPORTED) return;
  const now = Date.now();
  const today = new Date(now).toDateString();
  if (!force && (await AsyncStorage.getItem(SYNCED_KEY).catch(() => null)) === today) return;
  const firstSeen = Number(await AsyncStorage.getItem(FIRST_SEEN_KEY).catch(() => null));
  if (!firstSeen) {
    await AsyncStorage.setItem(FIRST_SEEN_KEY, String(now)).catch(() => {});
    if (!force) return;
  }
  let granted = await notificationsAllowed();
  if (!granted && now - firstSeen >= ASK_AFTER_MS && !(await AsyncStorage.getItem(ASKED_KEY).catch(() => null))) {
    granted = (await askNotifications()).granted;
  }
  if (!granted) return;

  // Private on a locked screen: memo titles only show once it's unlocked.
  await Notifications.setNotificationChannelAsync(CHANNEL, {
    name: S.channel,
    importance: Notifications.AndroidImportance.DEFAULT,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
  });

  await Notifications.cancelScheduledNotificationAsync('monthly').catch(() => {});
  if ((await reminderOn('monthly')) && unclassifiedCount > 0) {
    await Notifications.scheduleNotificationAsync({
      identifier: 'monthly',
      content: { title: S.monthlyTitle, body: S.monthlyBody(unclassifiedCount) },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.MONTHLY, channelId: CHANNEL, day: 1, hour: 9, minute: 0 },
    });
  }

  await Notifications.cancelScheduledNotificationAsync('weekly').catch(() => {});
  // Locked memos never show up here, not even their titles (the server
  // leaves them out).
  const picks = (await reminderOn('weekly')) ? (await fetchLookback()).items : [];
  if (picks.length >= 3) {
    await Notifications.scheduleNotificationAsync({
      identifier: 'weekly',
      content: { title: S.weeklyTitle, body: picks.map((it) => it.title.trim()).join(' · ') },
      // Saturday 10:00 (1 = Sunday).
      trigger: { type: Notifications.SchedulableTriggerInputTypes.WEEKLY, channelId: CHANNEL, weekday: 7, hour: 10, minute: 0 },
    });
  }
  // Only once both are planned: offline, the next Home refresh tries again.
  await AsyncStorage.setItem(SYNCED_KEY, today).catch(() => {});
}

// A memo was locked or moved to the trash: the planned '다시 보기' may name
// it, so it's dropped and planned again on the next Home refresh.
export async function forgetWeekly() {
  if (!SUPPORTED) return;
  await Notifications.cancelScheduledNotificationAsync('weekly').catch(() => {});
  await AsyncStorage.removeItem(SYNCED_KEY).catch(() => {});
}
