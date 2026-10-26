import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import * as BackgroundTask from 'expo-background-task';
import { fetchPlan, saveScreenshotItem } from '../api/client';
import { tellMehhReceived } from '../native/mehh';
import { createShareQueue, Progress, QueueState } from './shareQueueCore';

// Screenshots shared in "send and forget" style (Mehh): copied into the app's
// own documents folder the moment they arrive, then -- once the person has
// agreed to AI analysis -- Mehh is told they were received and they're saved
// to the server: in the app while it's open, and by a WorkManager job
// (SHARE_QUEUE_TASK, see shareQueueTask.ts) when it isn't. The rules live in
// shareQueueCore.ts.

export const SHARE_QUEUE_TASK = 'cortex-share-queue';

const KEY = 'cortex.shareQueue.v2';
// v1 held only jobs, all of which Mehh had already been told about.
const KEY_V1 = 'cortex.shareQueue.v1';

const queueDir = () => new Directory(Paths.document, 'share-queue');

async function load(): Promise<QueueState> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as QueueState;
    const v1 = await AsyncStorage.getItem(KEY_V1);
    return { jobs: v1 ? JSON.parse(v1) : [], receipts: [] };
  } catch {
    return { jobs: [], receipts: [] };
  }
}

let progress: Progress = { pending: 0, running: false, waitingConsent: false };
const listeners = new Set<(p: Progress) => void>();

const queue = createShareQueue({
  load,
  save: async (state) => {
    await AsyncStorage.setItem(KEY, JSON.stringify(state));
    await AsyncStorage.removeItem(KEY_V1);
  },
  copyIn: async (uri, id) => {
    const dir = queueDir();
    dir.create({ intermediates: true, idempotent: true });
    const source = new File(uri);
    const dest = new File(dir, `${id}.img`);
    await source.copy(dest);
    // expo-share-intent's cache-dir copy; ours is the one that counts now.
    // Never a content:// uri -- that would be the sender's own file.
    if (uri.startsWith(Paths.cache.uri)) {
      try {
        source.delete();
      } catch {}
    }
    return dest.uri;
  },
  readBase64: (uri) => new File(uri).base64(),
  exists: (uri) => new File(uri).exists,
  remove: (uri) => new File(uri).delete(),
  upload: async (base64) => {
    await saveScreenshotItem('other', base64);
  },
  consent: async () => (await fetchPlan()).aiConsent ?? null,
  tellMehh: tellMehhReceived,
  onProgress: (p) => {
    progress = p;
    listeners.forEach((l) => l(p));
  },
  schedule: () => {
    BackgroundTask.registerTaskAsync(SHARE_QUEUE_TASK, { minimumInterval: 15 }).catch(() => {});
  },
  unschedule: () => {
    BackgroundTask.unregisterTaskAsync(SHARE_QUEUE_TASK).catch(() => {});
  },
  now: () => Date.now(),
  newId: () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
});

// Copies shared files in; resolves with how many landed. Mehh hears about
// them only from drainShareQueue, once consent is there.
export const enqueueSharedImages = queue.enqueue;
// Tells Mehh / uploads if the person has agreed; otherwise does nothing.
export const drainShareQueue = queue.drain;
// After "동의하지 않음", the person picks: keep them in 미분류함 without AI,
// or not -- then the copies Mehh wasn't told about are deleted.
export const saveSharesWithoutAi = queue.saveWithoutAi;
export const discardUnreceivedShares = queue.discardUnreceived;
export const waitingShareCount = queue.waitingCount;

// What to do with Mehh photos when AI analysis is declined (decision M2,
// C): the first answer to "미분류함에 저장할까요?" is remembered and applied
// from then on without asking; the profile can change it ('ask' = ask
// every time). null = never answered.
export type DeclinedChoice = 'keep' | 'drop' | 'ask';
const CHOICE_KEY = 'cortex.mehhDeclinedChoice';
export async function getDeclinedChoice(): Promise<DeclinedChoice | null> {
  try {
    const v = await AsyncStorage.getItem(CHOICE_KEY);
    return v === 'keep' || v === 'drop' || v === 'ask' ? v : null;
  } catch {
    return null;
  }
}
export function setDeclinedChoice(choice: DeclinedChoice): Promise<void> {
  return AsyncStorage.setItem(CHOICE_KEY, choice).catch(() => {});
}

// Home: shared photos still waiting or being saved. Also drains the queue on
// mount and whenever the app comes back to the foreground.
export function useShareQueue(): Progress {
  const [state, setState] = useState(progress);
  useEffect(() => {
    listeners.add(setState);
    drainShareQueue();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') drainShareQueue();
    });
    return () => {
      listeners.delete(setState);
      sub.remove();
    };
  }, []);
  return state;
}
