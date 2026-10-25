// The share queue's rules, with everything platform-specific passed in, so
// they can be tested in plain Node (shareQueueCore.test.ts). shareQueue.ts
// wires the real storage, files, API and Mehh link.
//
// The one rule that matters most: nothing leaves the phone -- no upload, so
// no AI analysis -- and Mehh isn't told "received" until the person has
// agreed to AI analysis. Before that, shared photos only sit as local
// copies. Declining deletes those copies and Mehh is never told, so it keeps
// its originals.

export type Consent = 'agreed' | 'declined' | null;

export interface Job {
  id: string;
  uri: string;
  addedAt: number;
  attempts: number;
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
  upload(base64: string): Promise<void>;
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
    const state = await update((s) => ({ jobs: [...s.jobs, ...jobs], receipts: [...s.receipts, receipt] }));
    report({ pending: state.jobs.length });
    deps.schedule?.();
    return jobs.length;
  }

  // One run at a time. With consent: tells Mehh what was received, then
  // uploads, each job once per run (failures stay for the next run).
  // Without: does nothing at all.
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
    if ((await currentConsent()) !== 'agreed') {
      report({ pending: initial.jobs.length, running: false, waitingConsent: true });
      return { left: initial.jobs.length, waitingConsent: true };
    }
    report({ waitingConsent: false });

    // Receipts first: Mehh may go ahead once its photos are safely copied.
    let receipts: Receipt[] = [];
    await update((s) => {
      receipts = s.receipts;
      return { ...s, receipts: [] };
    });
    for (const r of receipts) deps.tellMehh(r.jobIds.length, r.mehhIds);

    const tried = new Set<string>();
    for (;;) {
      const { jobs } = await deps.load();
      const batch = jobs.filter((j) => !tried.has(j.id)).slice(0, CONCURRENCY);
      report({ pending: jobs.length, running: batch.length > 0 });
      if (batch.length === 0) break;
      batch.forEach((j) => tried.add(j.id));
      await Promise.all(batch.map(runJob));
    }
    const left = (await deps.load()).jobs.length;
    report({ pending: left, running: false });
    if (left === 0) deps.unschedule?.();
    return { left, waitingConsent: false };
  }

  async function runJob(job: Job) {
    if (!deps.exists(job.uri)) {
      // The copy is gone -- nothing left to save, don't keep retrying.
      const s = await update((st) => ({ ...st, jobs: st.jobs.filter((j) => j.id !== job.id) }));
      report({ pending: s.jobs.length });
      return;
    }
    try {
      await deps.upload(await deps.readBase64(job.uri));
    } catch {
      await update((st) => ({ ...st, jobs: st.jobs.map((j) => (j.id === job.id ? { ...j, attempts: j.attempts + 1 } : j)) }));
      return;
    }
    const s = await update((st) => ({ ...st, jobs: st.jobs.filter((j) => j.id !== job.id) }));
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
      return { jobs: s.jobs.filter((j) => !ids.has(j.id)), receipts: [] };
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

  return { enqueue, drain, discardUnreceived, progress: () => progress };
}
