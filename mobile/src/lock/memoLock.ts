import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { pinWaitMs } from './pinWait';

// Memo lock: a 4-digit PIN kept only on this device (Android keystore via
// SecureStore), optionally opened with the fingerprint/face the phone
// already has. The server just stores which memos are locked, so AI search
// and 모아서 만들기 can leave them out -- it never sees the PIN.
//
// Screens ask for the PIN through askPin(), which opens the Pin sheet and
// resolves when it closes (true = right PIN or biometrics).

const PIN_KEY = 'cortex.memoLock.pin';
const BIO_KEY = 'cortex.memoLock.biometric';
// { wrong: tries in a row, until: no tries before this time }. Kept on disk so
// closing the app doesn't start the count over.
const WAIT_KEY = 'cortex.memoLock.wait';

// Native only: there is no keystore on the web build.
export const LOCK_SUPPORTED = Platform.OS !== 'web';

export async function hasPin(): Promise<boolean> {
  if (!LOCK_SUPPORTED) return false;
  return !!(await SecureStore.getItemAsync(PIN_KEY).catch(() => null));
}

export async function setPin(pin: string): Promise<void> {
  await SecureStore.setItemAsync(PIN_KEY, pin);
  await AsyncStorage.removeItem(WAIT_KEY).catch(() => {});
}

async function readWait(): Promise<{ wrong: number; until: number }> {
  const raw = await AsyncStorage.getItem(WAIT_KEY).catch(() => null);
  try {
    const saved = raw ? JSON.parse(raw) : null;
    return { wrong: Number(saved?.wrong) || 0, until: Number(saved?.until) || 0 };
  } catch {
    return { wrong: 0, until: 0 };
  }
}

// When the pad opens again (a time, or 0 when it's open now).
export async function pinOpensAt(): Promise<number> {
  const { until } = await readWait();
  return until > Date.now() ? until : 0;
}

export async function checkPin(pin: string): Promise<boolean> {
  if (await pinOpensAt()) return false;
  const stored = await SecureStore.getItemAsync(PIN_KEY).catch(() => null);
  if (stored && stored === pin) {
    await AsyncStorage.removeItem(WAIT_KEY).catch(() => {});
    return true;
  }
  const wrong = (await readWait()).wrong + 1;
  const wait = pinWaitMs(wrong);
  await AsyncStorage.setItem(WAIT_KEY, JSON.stringify({ wrong, until: wait ? Date.now() + wait : 0 })).catch(() => {});
  return false;
}

export async function clearPin(): Promise<void> {
  await SecureStore.deleteItemAsync(PIN_KEY).catch(() => {});
  await AsyncStorage.removeItem(BIO_KEY).catch(() => {});
  await AsyncStorage.removeItem(WAIT_KEY).catch(() => {});
}

// Whether the phone can open locks with a fingerprint/face at all.
export async function biometricAvailable(): Promise<boolean> {
  if (!LOCK_SUPPORTED) return false;
  try {
    return (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
  } catch {
    return false;
  }
}

export async function biometricOn(): Promise<boolean> {
  return (await AsyncStorage.getItem(BIO_KEY).catch(() => null)) === '1';
}

export async function setBiometricOn(on: boolean): Promise<void> {
  if (on) await AsyncStorage.setItem(BIO_KEY, '1').catch(() => {});
  else await AsyncStorage.removeItem(BIO_KEY).catch(() => {});
}

// Fingerprint/face only (no device PIN fallback: the memo PIN is that).
export async function tryBiometric(prompt: string, cancel: string): Promise<boolean> {
  if (!(await biometricOn()) || !(await biometricAvailable())) return false;
  try {
    const r = await LocalAuthentication.authenticateAsync({ promptMessage: prompt, cancelLabel: cancel, disableDeviceFallback: true });
    return r.success;
  } catch {
    return false;
  }
}

// "비밀번호를 잊었어요": the phone's own screen lock proves it's the owner.
// false when the phone has no screen lock at all.
export async function confirmDeviceOwner(prompt: string): Promise<boolean> {
  try {
    const level = await LocalAuthentication.getEnrolledLevelAsync();
    if (level === LocalAuthentication.SecurityLevel.NONE) return false;
    const r = await LocalAuthentication.authenticateAsync({ promptMessage: prompt, disableDeviceFallback: false });
    return r.success;
  } catch {
    return false;
  }
}

// --- the Pin sheet's hand-off ---------------------------------------------
export type PinMode = 'set' | 'check';
type Pending = { mode: PinMode; resolve: (ok: boolean) => void };
let pending: Pending | null = null;
let opener: ((mode: PinMode) => void) | null = null;

// RootNavigator registers how to open the sheet.
export function registerPinOpener(fn: (mode: PinMode) => void) {
  opener = fn;
}

// 'check' tries biometrics first; 'set' asks for a new PIN twice.
export async function askPin(mode: PinMode, biometricPrompt?: { prompt: string; cancel: string }): Promise<boolean> {
  if (mode === 'check' && biometricPrompt && (await tryBiometric(biometricPrompt.prompt, biometricPrompt.cancel))) return true;
  if (!opener) return false;
  pending?.resolve(false);
  return new Promise<boolean>((resolve) => {
    pending = { mode, resolve };
    opener!(mode);
  });
}

export function finishPin(ok: boolean) {
  const p = pending;
  pending = null;
  p?.resolve(ok);
}
