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
  unreported?: { saved: number; quota: number };
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
  tellMehh(count: number, ids?: string[]): void;
  onProgress?(progress: Progress): void;
  // WorkManager fallback for when the app is closed.
  schedule?(): void;
  unschedule?(): void;
  now(): number;
  newId(): string;
}

const CONCURRENCY = 3;

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
    const jobs: Job[] = [];
    const ids: string[] = [];
    copied.forEach((c, i) => {
      if (!c) return;
      jobs.push({ id: c.id, uri: c.uri, addedAt: deps.now(), attempts: 0 });
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

  async function run(): Promise<{ left: number; waitingConsent: boolean }> {
    const initial = await deps.load();
    if (initial.jobs.length === 0 && initial.receipts.length === 0) {
      report({ pending: 0, running: false, waitingConsent: false });
      deps.unschedule?.();
      return { left: 0, waitingConsent: false };
    }
    const agreed = (await currentConsent()) === 'agreed';
    const eligible = (j: Job) => agreed || !!j.noAi;
    if (!initial.jobs.some(eligible)) {
      report({ pending: initial.jobs.length, running: false, waitingConsent: true });
      return { left: initial.jobs.length, waitingConsent: true };
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
      report({ pending: jobs.length, running: batch.length > 0 });
      if (batch.length === 0) break;
      batch.forEach((j) => tried.add(j.id));
      await Promise.all(batch.map(runJob));
    }
    const { jobs: left } = await deps.load();
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
    return s.jobs.filter((j) => !j.noAi).length;
  }

  // The person declined AI but wants these kept: every waiting photo uploads
  // marked noAi -- the server files them in 미분류함 without calling the AI
  // -- and Mehh is told about the ones it hadn't heard of yet.
  async function saveWithoutAi(): Promise<number> {
    let receipts: Receipt[] = [];
    let kept = 0;
    await update((s) => {
      receipts = s.receipts;
      kept = s.jobs.filter((j) => !j.noAi).length;
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
      report({ pending: s.jobs.length });
      return;
    }
    let result: UploadResult | void;
    try {
      result = await deps.upload(await deps.readBase64(job.uri), job.id);
    } catch {
      await update((st) => ({ ...st, jobs: st.jobs.map((j) => (j.id === job.id ? { ...j, attempts: j.attempts + 1 } : j)) }));
      return;
    }
    const quota = result?.unclassifiedReason === 'quota' ? 1 : 0;
    const s = await update((st) => ({
      ...st,
      jobs: st.jobs.filter((j) => j.id !== job.id),
      unreported: { saved: (st.unreported?.saved ?? 0) + 1, quota: (st.unreported?.quota ?? 0) + quota },
    }));
    report({ pending: s.jobs.length });
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
    report({ pending: state.jobs.length, waitingConsent: state.jobs.length > 0 });
    if (state.jobs.length === 0) deps.unschedule?.();
    return dropped.length;
  }

  // The saves not yet told, cleared as they're handed over.
  async function takeUnreported(): Promise<{ saved: number; quota: number }> {
    let out = { saved: 0, quota: 0 };
    await update((s) => {
      out = s.unreported ?? out;
      return { jobs: s.jobs, receipts: s.receipts };
    });
    return out;
  }

  return { enqueue, drain, discardUnreceived, saveWithoutAi, waitingCount, takeUnreported, progress: () => progress };
}
