import { reportAppError } from '../api/client';
import { onlyStackFrames } from './stackFrames';

// Tells our server where the app broke (decision E1). Only the error's class
// name and code positions: an error's message can quote a memo, so it never
// leaves the phone. No account either; the server stores none.
const { expo } = require('../../app.json') as { expo: { version: string; android: { versionCode: number } } };
const APP_VERSION = `${expo.version}-vc${expo.android.versionCode}`;

const MAX_PER_RUN = 3;
let sent = 0;

export function reportError(err: unknown): Promise<void> {
  if (__DEV__ || sent >= MAX_PER_RUN || !(err instanceof Error)) return Promise.resolve();
  const stack = onlyStackFrames(err.stack ?? '');
  if (!stack) return Promise.resolve();
  sent++;
  return reportAppError({ appVersion: APP_VERSION, name: err.name, stack }).catch(() => {});
}

// Errors outside a render (a tap handler, a timer). React Native closes the app
// on a fatal one, so that waits a moment for the report to get out.
const FATAL_WAIT_MS = 1500;

export function installErrorReporting() {
  const utils = (globalThis as { ErrorUtils?: { getGlobalHandler(): (e: unknown, fatal?: boolean) => void; setGlobalHandler(fn: (e: unknown, fatal?: boolean) => void): void } }).ErrorUtils;
  if (!utils) return;
  const previous = utils.getGlobalHandler();
  utils.setGlobalHandler((err, fatal) => {
    const report = reportError(err);
    if (!fatal) return previous(err, fatal);
    Promise.race([report, new Promise((resolve) => setTimeout(resolve, FATAL_WAIT_MS))]).finally(() => previous(err, fatal));
  });
}
