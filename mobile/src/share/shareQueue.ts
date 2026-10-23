import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import * as BackgroundTask from 'expo-background-task';
import { saveScreenshotItem } from '../api/client';

// Screenshots shared in "send and forget" style (Mehh): copied into the app's
// own documents folder the moment they arrive, then saved to the server from
// here -- in the app while it's open, and by a WorkManager job
// (SHARE_QUEUE_TASK, see shareQueueTask.ts) when it isn't. A copy is only
// deleted once its save went through, so a failed one is simply tried again
// on the next run.

export const SHARE_QUEUE_TASK = 'cortex-share-queue';

const KEY = 'cortex.shareQueue.v1';
const CONCURRENCY = 3;

interface Job {
  id: string;
  uri: string;
  addedAt: number;
  attempts: number;
}

const queueDir = () => new Directory(Paths.document, 'share-queue');

// Every read-modify-write of the stored list goes through this chain, so a
// finishing save and a new share can't overwrite each other's change.
let writes: Promise<unknown> = Promise.resolve();
function update(fn: (jobs: Job[]) => Job[]): Promise<Job[]> {
  const next = writes.then(async () => {
    const jobs = fn(await readJobs());
    await AsyncStorage.setItem(KEY, JSON.stringify(jobs));
    return jobs;
  });
  writes = next.catch(() => {});
  return next;
}

async function readJobs(): Promise<Job[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Job[]) : [];
  } catch {
    return [];
  }
}

// --- progress, for the line on Home -----------------------------------------

type Progress = { pending: number; running: boolean };
let progress: Progress = { pending: 0, running: false };
const listeners = new Set<(p: Progress) => void>();
function setProgress(p: Partial<Progress>) {
  progress = { ...progress, ...p };
  listeners.forEach((l) => l(progress));
}

// --- public API --------------------------------------------------------------

// Copies each shared file into the queue. Returns, per input, whether its
// copy landed -- only those are safe for the sender to delete.
export async function enqueueSharedImages(uris: string[]): Promise<boolean[]> {
  const dir = queueDir();
  dir.create({ intermediates: true, idempotent: true });
  const added: Job[] = [];
  const copied = await Promise.all(
    uris.map(async (uri, i) => {
      try {
        const id = `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 8)}`;
        const dest = new File(dir, `${id}.img`);
        const source = new File(uri);
        await source.copy(dest);
        added.push({ id, uri: dest.uri, addedAt: Date.now(), attempts: 0 });
        // expo-share-intent's cache-dir copy; ours is the one that counts now.
        // Never a content:// uri -- that would be the sender's own file.
        if (uri.startsWith(Paths.cache.uri)) {
          try {
            source.delete();
          } catch {}
        }
        return true;
      } catch {
        return false;
      }
    })
  );
  if (added.length > 0) {
    const jobs = await update((jobs) => [...jobs, ...added]);
    setProgress({ pending: jobs.length });
    // The WorkManager fallback for when the app is closed before it's done.
    BackgroundTask.registerTaskAsync(SHARE_QUEUE_TASK, { minimumInterval: 15 }).catch(() => {});
  }
  return copied;
}

// Saves whatever is waiting. One run at a time; each job is tried once per
// run. Resolves with how many are still waiting.
let running: Promise<number> | null = null;
export function drainShareQueue(): Promise<number> {
  if (!running) {
    running = drain().finally(() => {
      running = null;
    });
  }
  return running;
}

async function drain(): Promise<number> {
  // Re-read after each batch so photos shared mid-run join this run.
  const tried = new Set<string>();
  for (;;) {
    const jobs = await readJobs();
    const batch = jobs.filter((j) => !tried.has(j.id)).slice(0, CONCURRENCY);
    setProgress({ pending: jobs.length, running: batch.length > 0 });
    if (batch.length === 0) break;
    batch.forEach((j) => tried.add(j.id));
    await Promise.all(batch.map(runJob));
  }
  const left = await readJobs();
  setProgress({ pending: left.length, running: false });
  if (left.length === 0) BackgroundTask.unregisterTaskAsync(SHARE_QUEUE_TASK).catch(() => {});
  return left.length;
}

async function runJob(job: Job) {
  const file = new File(job.uri);
  if (!file.exists) {
    // Nothing left to save (the copy was cleared) -- don't keep retrying.
    const jobs = await update((all) => all.filter((j) => j.id !== job.id));
    setProgress({ pending: jobs.length });
    return;
  }
  try {
    await saveScreenshotItem('other', await file.base64());
  } catch {
    await update((all) => all.map((j) => (j.id === job.id ? { ...j, attempts: j.attempts + 1 } : j)));
    return;
  }
  const jobs = await update((all) => all.filter((j) => j.id !== job.id));
  setProgress({ pending: jobs.length });
  try {
    file.delete();
  } catch {
    // a stray file in the queue folder is harmless
  }
}

// Home: how many shared photos are still being saved. Also drains the queue
// on mount and whenever the app comes back to the foreground.
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
