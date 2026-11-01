// The share queue's rules, with everything platform-specific passed in, so
// they can be tested in plain Node (shareQueueCore.test.ts). shareQueue.ts
// wires the real storage, files, API and Mehh link.
//
// The one rule that matters most: no AI analysis without consent. Until the
// person answers, shared photos only sit as local copies -- nothing is
// uploaded and Mehh isn't told "received". Agreeing tells Mehh and uploads.
// Declining asks once more (decision C, 2026-10-26): save them to 미분류함
// without AI (saveWithoutAi -- uploaded, and the server, seeing no consent,
// never sends them to the AI), or not (discardUnreceived -- the copies are
// deleted and Mehh, never told, keeps its originals).

export type Consent = 'agreed' | 'declined' | null;

export interface Job {
  id: string;
  uri: string;
  addedAt: number;
  attempts: number;
  // The person declined AI but chose to keep these: uploaded without
  // waiting for consent (they land in 미분류함, unanalyzed).
  noAi?: boolean;
  // Gave up: the server refused it (too large, unreadable) or it failed
  // MAX_ATTEMPTS times. The copy stays on the phone; it's no longer
  // uploaded, counted as 저장 중, or a reason to keep the background job.
  stopped?: boolean;
  // Why and when it stopped. A server error may pass, so that photo gets
  // another round later (REVIVE_AFTER_MS).
  stoppedStatus?: number;
  stoppedAt?: number;
  // The person was already told this one failed: another round doesn't say so twice.
  failureTold?: boolean;
  // The account signed in when it arrived; only that account uploads it.
  // Jobs from older builds have none and go to whoever is signed in.
  ownerId?: string;
}

// A share Mehh hasn't been told about yet: which copied jobs it covers and,
// position for position, Mehh's ids for them (absent when they couldn't be
// matched up -- Mehh then gets a count only).
export interface Receipt {
  jobIds: string[];
  mehhIds?: string[];
}

export interface QueueState {
  jobs: Job[];
  receipts: Receipt[];
  // Saves not yet told to the person (Home says it once, then clears):
  // how many landed, and how many of those went to 미분류함 because the
  // month's AI sorting ran out. Background uploads count too.
  // failed: photos that stopped (could not be saved), said once too.
  unreported?: { saved: number; quota: number; failed?: number };
}

// What the server said about one saved photo.
export interface UploadResult {
  unclassifiedReason?: 'quota' | 'consent' | 'failed' | null;
}

export interface Progress {
  pending: number;
  running: boolean;
  waitingConsent: boolean;
}

export interface QueueDeps {
  load(): Promise<QueueState>;
  save(state: QueueState): Promise<void>;
  // Copies a shared file into the queue folder; resolves with the copy's uri.
  copyIn(uri: string, id: string): Promise<string>;
  readBase64(uri: string): Promise<string>;
  exists(uri: string): boolean;
  remove(uri: string): void;
  // jobId goes along as the save's request id, so a retry of a save that
  // did land (timed out on the way back) doesn't make a second item.
  upload(base64: string, jobId: string): Promise<UploadResult | void>;
  // The person's current answer. A failure to find out counts as "not
  // agreed" -- nothing is sent on a guess.
  consent(): Promise<Consent>;
  // Who is signed in now (null: no one / unknown).
  owner?(): Promise<string | null>;
  tellMehh(count: number, ids?: string[]): void;
  onProgress?(progress: Progress): void;
  // WorkManager fallback for when the app is closed.
  schedule?(): void;
  unschedule?(): void;
  now(): number;
  newId(): string;
}

const CONCURRENCY = 3;
// Tries before a photo that keeps failing stops (the background job runs
// every 15 minutes, so about two and a half hours of retries). No signal and
// 429 (too many saves in a row) don't count: those pass on their own.
export const MAX_ATTEMPTS = 10;
// Mehh may have deleted its original and no screen brings a stopped photo back,
// so one stopped by a server error starts over once the server has had a day.
export const REVIVE_AFTER_MS = 24 * 60 * 60 * 1000;

// 400 (unreadable) and 413 (too large) won't change on a retry.
const statusOf = (err: unknown) => (err as { status?: number } | null)?.status;
const isRefused = (err: unknown) => statusOf(err) === 400 || statusOf(err) === 413;
const passesOnItsOwn = (err: unknown) => statusOf(err) === undefined || statusOf(err) === 429;
const live = (jobs: Job[]) => jobs.filter((j) => !j.stopped);

export function createShareQueue(deps: QueueDeps) {
  let progress: Progress = { pending: 0, running: false, waitingConsent: false };
  const report = (p: Partial<Progress>) => {
    progress = { ...progress, ...p };
    deps.onProgress?.(progress);
  };

  // Every read-modify-write of the stored state goes through this chain, so
  // a finishing upload and a new share can't overwrite each other's change.
  let writes: Promise<unknown> = Promise.resolve();
  function update(fn: (s: QueueState) => QueueState): Promise<QueueState> {
    const next = writes.then(async () => {
      const state = fn(await deps.load());
      await deps.save(state);
      return state;
    });
    writes = next.catch(() => {});
    return next;
  }

  async function currentOwner(): Promise<string | null> {
    try {
      return (await deps.owner?.()) ?? null;
    } catch {
      return null;
    }
  }

  async function currentConsent(): Promise<Consent> {
    try {
      return await deps.consent();
    } catch {
      return null;
    }
  }

  // Copies each shared file in. Resolves with how many copies landed. Mehh
  // is NOT told here -- that waits for drain() and consent.
  async function enqueue(uris: string[], mehhIds?: string[]): Promise<number> {
    const copied = await Promise.all(
      uris.map(async (uri) => {
        const id = deps.newId();
        try {
          return { id, uri: await deps.copyIn(uri, id) };
        } catch {
          return null;
        }
      })
    );
    const ownerId = (await currentOwner()) ?? undefined;
    const jobs: Job[] = [];
    const ids: string[] = [];
    copied.forEach((c, i) => {
      if (!c) return;
      jobs.push({ id: c.id, uri: c.uri, addedAt: deps.now(), attempts: 0, ...(ownerId ? { ownerId } : null) });
      if (mehhIds) ids.push(mehhIds[i]);
    });
    if (jobs.length === 0) return 0;
    const receipt: Receipt = { jobIds: jobs.map((j) => j.id), ...(mehhIds?.length === uris.length ? { mehhIds: ids } : null) };
    const state = await update((s) => ({ ...s, jobs: [...s.jobs, ...jobs], receipts: [...s.receipts, receipt] }));
    report({ pending: state.jobs.length });
    deps.schedule?.();
    return jobs.length;
  }

  // One run at a time. With consent: tells Mehh what was received, then
  // uploads, each job once per run (failures stay for the next run).
  // Without: uploads only the photos kept with saveWithoutAi.
  let running: Promise<{ left: number; waitingConsent: boolean }> | null = null;
  function drain() {
    if (!running) {
      running = run().finally(() => {
        running = null;
      });
    }
    return running;
  }

  // Runs at the start of every drain. Once nothing is live the background job
  // is off, so in practice this happens when the app opens.
  async function reviveStopped() {
    const due = (j: Job) => !!j.stopped && (j.stoppedStatus ?? 0) >= 500 && deps.now() - (j.stoppedAt ?? deps.now()) >= REVIVE_AFTER_MS;
    if (!(await deps.load()).jobs.some(due)) return;
    await update((s) => ({
      ...s,
      jobs: s.jobs.map((j) => {
        if (!due(j)) return j;
        const { stopped, stoppedStatus, stoppedAt, ...rest } = j;
        return { ...rest, attempts: 0 };
      }),
    }));
    deps.schedule?.();
  }

  async function run(): Promise<{ left: number; waitingConsent: boolean }> {
    await reviveStopped();
    const initial = await deps.load();
    const initialJobs = live(initial.jobs);
    if (initialJobs.length === 0 && initial.receipts.length === 0) {
      report({ pending: 0, running: false, waitingConsent: false });
      deps.unschedule?.();
      return { left: 0, waitingConsent: false };
    }
    const agreed = (await currentConsent()) === 'agreed';
    const me = await currentOwner();
    const mine = (j: Job) => !j.ownerId || j.ownerId === me;
    const eligible = (j: Job) => !j.stopped && mine(j) && (agreed || !!j.noAi);
    if (!initialJobs.some(eligible)) {
      report({ pending: initialJobs.length, running: false, waitingConsent: true });
      return { left: initialJobs.length, waitingConsent: true };
    }
    report({ waitingConsent: false });

    if (agreed) {
      // Receipts first: Mehh may go ahead once its photos are safely copied.
      let receipts: Receipt[] = [];
      await update((s) => {
        receipts = s.receipts;
        return { ...s, receipts: [] };
      });
      for (const r of receipts) deps.tellMehh(r.jobIds.length, r.mehhIds);
    }

    const tried = new Set<string>();
    for (;;) {
      const { jobs } = await deps.load();
      const batch = jobs.filter((j) => eligible(j) && !tried.has(j.id)).slice(0, CONCURRENCY);
      report({ pending: live(jobs).length, running: batch.length > 0 });
      if (batch.length === 0) break;
      batch.forEach((j) => tried.add(j.id));
      await Promise.all(batch.map(runJob));
    }
    const left = live((await deps.load()).jobs);
    const waitingConsent = left.some((j) => !eligible(j));
    report({ pending: left.length, running: false, waitingConsent });
    if (left.length === 0) deps.unschedule?.();
    return { left: left.length, waitingConsent };
  }

  // How many photos wait on consent: everything not yet uploaded and not
  // already kept without AI -- including ones Mehh was told about under an
  // earlier consent whose upload failed before it was withdrawn.
  async function waitingCount(): Promise<number> {
    const s = await deps.load();
    return live(s.jobs).filter((j) => !j.noAi).length;
  }

  // The person declined AI but wants these kept: every waiting photo uploads
  // marked noAi -- the server files them in 미분류함 without calling the AI
  // -- and Mehh is told about the ones it hadn't heard of yet.
  async function saveWithoutAi(): Promise<number> {
    let receipts: Receipt[] = [];
    let kept = 0;
    await update((s) => {
      receipts = s.receipts;
      kept = live(s.jobs).filter((j) => !j.noAi).length;
      return { ...s, jobs: s.jobs.map((j) => (j.noAi ? j : { ...j, noAi: true })), receipts: [] };
    });
    for (const r of receipts) deps.tellMehh(r.jobIds.length, r.mehhIds);
    if (kept > 0) deps.schedule?.();
    // A run already going may have started before these were marked.
    if (running) await running;
    await drain();
    return kept;
  }

  async function runJob(job: Job) {
    if (!deps.exists(job.uri)) {
      // The copy is gone -- nothing left to save, don't keep retrying.
      const s = await update((st) => ({ ...st, jobs: st.jobs.filter((j) => j.id !== job.id) }));
      report({ pending: live(s.jobs).length });
      return;
    }
    let result: UploadResult | void;
    let uploading = false;
    try {
      const base64 = await deps.readBase64(job.uri);
      uploading = true;
      result = await deps.upload(base64, job.id);
    } catch (err) {
      if (uploading && passesOnItsOwn(err)) return;
      const s = await update((st) => {
        let stopped = false;
        let tell = false;
        const jobs = st.jobs.map((j) => {
          if (j.id !== job.id) return j;
          const attempts = j.attempts + 1;
          stopped = isRefused(err) || attempts >= MAX_ATTEMPTS;
          tell = stopped && !j.failureTold;
          return { ...j, attempts, ...(stopped ? { stopped: true, stoppedStatus: statusOf(err), stoppedAt: deps.now(), failureTold: true } : null) };
        });
        if (!tell) return { ...st, jobs };
        const u = st.unreported ?? { saved: 0, quota: 0 };
        return { ...st, jobs, unreported: { ...u, failed: (u.failed ?? 0) + 1 } };
      });
      report({ pending: live(s.jobs).length });
      return;
    }
    const quota = result?.unclassifiedReason === 'quota' ? 1 : 0;
    const s = await update((st) => ({
      ...st,
      jobs: st.jobs.filter((j) => j.id !== job.id),
      unreported: { ...st.unreported, saved: (st.unreported?.saved ?? 0) + 1, quota: (st.unreported?.quota ?? 0) + quota },
    }));
    report({ pending: live(s.jobs).length });
    try {
      deps.remove(job.uri);
    } catch {
      // a stray file in the queue folder is harmless
    }
  }

  // The person declined: every share Mehh wasn't told about yet is deleted
  // here, and Mehh is never told -- it keeps its originals. (Photos Mehh was
  // already told about stay, waiting, since their originals may be gone.)
  async function discardUnreceived(): Promise<number> {
    let dropped: Job[] = [];
    const state = await update((s) => {
      const ids = new Set(s.receipts.flatMap((r) => r.jobIds));
      dropped = s.jobs.filter((j) => ids.has(j.id));
      return { ...s, jobs: s.jobs.filter((j) => !ids.has(j.id)), receipts: [] };
    });
    for (const j of dropped) {
      try {
        deps.remove(j.uri);
      } catch {}
    }
    const left = live(state.jobs).length;
    report({ pending: left, waitingConsent: left > 0 });
    if (left === 0) deps.unschedule?.();
    return dropped.length;
  }

  // The account is being deleted: its waiting photos (and ones from before
  // jobs had an owner) are deleted here, and Mehh, if it wasn't told about
  // them yet, never is.
  async function discardOwnedBy(userId: string): Promise<number> {
    let dropped: Job[] = [];
    const state = await update((s) => {
      dropped = s.jobs.filter((j) => !j.ownerId || j.ownerId === userId);
      const gone = new Set(dropped.map((j) => j.id));
      const receipts = s.receipts
        .map((r) => {
          const keep = r.jobIds.map((id, i) => (gone.has(id) ? -1 : i)).filter((i) => i >= 0);
          return { jobIds: keep.map((i) => r.jobIds[i]), ...(r.mehhIds ? { mehhIds: keep.map((i) => r.mehhIds![i]) } : null) };
        })
        .filter((r) => r.jobIds.length > 0);
      return { ...s, jobs: s.jobs.filter((j) => !gone.has(j.id)), receipts };
    });
    for (const j of dropped) {
      try {
        deps.remove(j.uri);
      } catch {}
    }
    const left = live(state.jobs).length;
    report({ pending: left });
    if (left === 0) deps.unschedule?.();
    return dropped.length;
  }

  // The saves not yet told, cleared as they're handed over.
  async function takeUnreported(): Promise<{ saved: number; quota: number; failed?: number }> {
    let out: { saved: number; quota: number; failed?: number } = { saved: 0, quota: 0 };
    await update((s) => {
      out = s.unreported ?? out;
      return { jobs: s.jobs, receipts: s.receipts };
    });
    return out;
  }

  return { enqueue, drain, discardUnreceived, discardOwnedBy, saveWithoutAi, waitingCount, takeUnreported, progress: () => progress };
}
