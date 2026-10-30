// npm test -- the share queue's consent rules, with fake storage/files/API.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Consent, createShareQueue, MAX_ATTEMPTS, QueueState } from './shareQueueCore';

function setup(consent: Consent | 'error' = null, opts: { failCopy?: string[]; failUpload?: number; failStatus?: number } = {}) {
  let state: QueueState = { jobs: [], receipts: [] };
  const files = new Set<string>();
  const log: string[] = [];
  let answer = consent;
  let uploadFailures = opts.failUpload ?? 0;
  let n = 0;
  const queue = createShareQueue({
    load: async () => structuredClone(state),
    save: async (s) => {
      state = structuredClone(s);
    },
    copyIn: async (uri, id) => {
      if (opts.failCopy?.includes(uri)) throw new Error('copy failed');
      const dest = `queue/${id}`;
      files.add(dest);
      return dest;
    },
    readBase64: async (uri) => `b64:${uri}`,
    exists: (uri) => files.has(uri),
    remove: (uri) => {
      files.delete(uri);
    },
    upload: async (b64) => {
      if (uploadFailures > 0) {
        uploadFailures--;
        throw Object.assign(new Error('upload failed'), opts.failStatus ? { status: opts.failStatus } : null);
      }
      log.push(`upload ${b64}`);
    },
    consent: async () => {
      if (answer === 'error') throw new Error('offline');
      return answer;
    },
    tellMehh: (count, ids) => log.push(`mehh count=${count} ids=${ids?.join(',') ?? '-'}`),
    now: () => 0,
    newId: () => `j${++n}`,
  });
  return {
    queue,
    log,
    files,
    state: () => state,
    setConsent: (c: Consent) => {
      answer = c;
    },
  };
}

test('fresh guest, consent not answered yet: share is copied, nothing uploaded, Mehh not told', async () => {
  const t = setup(null);
  assert.equal(await t.queue.enqueue(['a', 'b'], ['101', '102']), 2);
  const r = await t.queue.drain();
  assert.deepEqual(r, { left: 2, waitingConsent: true });
  assert.deepEqual(t.log, []);
  assert.equal(t.files.size, 2);
});

test('consent declined earlier: still nothing leaves', async () => {
  const t = setup('declined');
  await t.queue.enqueue(['a'], ['101']);
  assert.equal((await t.queue.drain()).waitingConsent, true);
  assert.deepEqual(t.log, []);
});

test('consent lookup fails (offline / signed out): treated as not agreed', async () => {
  const t = setup('error');
  await t.queue.enqueue(['a'], ['101']);
  assert.equal((await t.queue.drain()).waitingConsent, true);
  assert.deepEqual(t.log, []);
});

test('background run (app closed) before consent: does nothing, keeps the copies', async () => {
  const t = setup(null);
  await t.queue.enqueue(['a', 'b'], ['101', '102']);
  // what the WorkManager task calls
  await t.queue.drain();
  await t.queue.drain();
  assert.deepEqual(t.log, []);
  assert.equal(t.state().jobs.length, 2);
  assert.equal(t.state().receipts.length, 1);
});

test('agreeing: Mehh is told first, then the photos upload, then copies go', async () => {
  const t = setup(null);
  await t.queue.enqueue(['a', 'b'], ['101', '102']);
  await t.queue.drain();
  t.setConsent('agreed');
  const r = await t.queue.drain();
  assert.deepEqual(r, { left: 0, waitingConsent: false });
  assert.equal(t.log[0], 'mehh count=2 ids=101,102');
  assert.deepEqual(t.log.slice(1).sort(), ['upload b64:queue/j1', 'upload b64:queue/j2']);
  assert.equal(t.files.size, 0);
  assert.deepEqual({ jobs: t.state().jobs, receipts: t.state().receipts }, { jobs: [], receipts: [] });
});

test('declining: copies deleted, Mehh never told, nothing uploaded', async () => {
  const t = setup(null);
  await t.queue.enqueue(['a', 'b'], ['101', '102']);
  await t.queue.drain();
  t.setConsent('declined');
  assert.equal(await t.queue.discardUnreceived(), 2);
  await t.queue.drain();
  assert.deepEqual(t.log, []);
  assert.equal(t.files.size, 0);
  assert.deepEqual({ jobs: t.state().jobs, receipts: t.state().receipts }, { jobs: [], receipts: [] });
});

test('already agreed: Mehh told and uploads run on the first drain', async () => {
  const t = setup('agreed');
  await t.queue.enqueue(['a'], ['101']);
  await t.queue.drain();
  assert.deepEqual(t.log, ['mehh count=1 ids=101', 'upload b64:queue/j1']);
});

test('only copied photos are reported to Mehh, ids kept in order', async () => {
  const t = setup('agreed', { failCopy: ['b'] });
  assert.equal(await t.queue.enqueue(['a', 'b', 'c'], ['101', '102', '103']), 2);
  await t.queue.drain();
  assert.equal(t.log[0], 'mehh count=2 ids=101,103');
});

test('ids that do not line up with the files: count only', async () => {
  const t = setup('agreed');
  await t.queue.enqueue(['a', 'b'], ['101']);
  await t.queue.drain();
  assert.equal(t.log[0], 'mehh count=2 ids=-');
});

test('a failed upload stays queued and retries on the next run; Mehh is told once', async () => {
  const t = setup('agreed', { failUpload: 1 });
  await t.queue.enqueue(['a'], ['101']);
  assert.equal((await t.queue.drain()).left, 1);
  assert.equal((await t.queue.drain()).left, 0);
  assert.deepEqual(t.log, ['mehh count=1 ids=101', 'upload b64:queue/j1']);
});

test('withdrawing consent later: queued photos pause, nothing more is uploaded', async () => {
  const t = setup('agreed', { failUpload: 1 });
  await t.queue.enqueue(['a'], ['101']);
  await t.queue.drain(); // told Mehh, upload failed
  t.setConsent('declined');
  assert.equal((await t.queue.drain()).waitingConsent, true);
  assert.deepEqual(t.log, ['mehh count=1 ids=101']);
  // already-received photos aren't thrown away by a later decline
  assert.equal(await t.queue.discardUnreceived(), 0);
  assert.equal(t.state().jobs.length, 1);
});

test('declined, then "미분류함에 저장": Mehh told, photos upload without consent, none left waiting', async () => {
  const t = setup(null);
  await t.queue.enqueue(['a', 'b'], ['101', '102']);
  await t.queue.drain();
  t.setConsent('declined');
  assert.equal(await t.queue.waitingCount(), 2);
  assert.equal(await t.queue.saveWithoutAi(), 2);
  assert.equal(t.log[0], 'mehh count=2 ids=101,102');
  assert.deepEqual(t.log.slice(1).sort(), ['upload b64:queue/j1', 'upload b64:queue/j2']);
  assert.deepEqual({ jobs: t.state().jobs, receipts: t.state().receipts }, { jobs: [], receipts: [] });
  assert.equal(t.queue.progress().waitingConsent, false);
});

test('kept without AI but the upload fails: retried by later runs even without consent; Mehh told once', async () => {
  const t = setup('declined', { failUpload: 1 });
  await t.queue.enqueue(['a'], ['101']);
  await t.queue.saveWithoutAi();
  assert.equal(t.state().jobs.length, 1);
  assert.equal((await t.queue.drain()).left, 0);
  assert.deepEqual(t.log, ['mehh count=1 ids=101', 'upload b64:queue/j1']);
});

test('a new share after choosing "미분류함에 저장" still waits for its own answer', async () => {
  const t = setup('declined');
  await t.queue.enqueue(['a'], ['101']);
  await t.queue.saveWithoutAi();
  await t.queue.enqueue(['b'], ['102']);
  const r = await t.queue.drain();
  assert.deepEqual(r, { left: 1, waitingConsent: true });
  assert.deepEqual(t.log, ['mehh count=1 ids=101', 'upload b64:queue/j1']);
  assert.equal(await t.queue.waitingCount(), 1);
});

test('agreed, upload failed, consent withdrawn: the decline question still covers it, and "저장" uploads it', async () => {
  const t = setup('agreed', { failUpload: 1 });
  await t.queue.enqueue(['a'], ['101']);
  await t.queue.drain(); // Mehh told, upload failed
  t.setConsent('declined');
  assert.equal((await t.queue.drain()).waitingConsent, true);
  assert.equal(await t.queue.waitingCount(), 1);
  assert.equal(await t.queue.saveWithoutAi(), 1);
  assert.deepEqual(t.log, ['mehh count=1 ids=101', 'upload b64:queue/j1']);
  assert.deepEqual({ jobs: t.state().jobs, receipts: t.state().receipts }, { jobs: [], receipts: [] });
});

test('a save that landed but timed out, then re-uploaded: the server keeps one item (same request id)', async () => {
  // A fake server that dedupes by request id, like POST /items does.
  const stored = new Map<string, string>();
  let timeoutOnce = true;
  let state: QueueState = { jobs: [], receipts: [] };
  let n = 0;
  const queue = createShareQueue({
    load: async () => structuredClone(state),
    save: async (s) => {
      state = structuredClone(s);
    },
    copyIn: async (_uri, id) => `queue/${id}`,
    readBase64: async (uri) => `b64:${uri}`,
    exists: () => true,
    remove: () => {},
    upload: async (b64, jobId) => {
      if (!stored.has(jobId)) stored.set(jobId, b64);
      if (timeoutOnce) {
        timeoutOnce = false;
        throw new Error('timed out'); // the row exists, the answer never came back
      }
    },
    consent: async () => 'agreed',
    tellMehh: () => {},
    now: () => 0,
    newId: () => `job-${++n}`,
  });
  await queue.enqueue(['a'], ['101']);
  assert.equal((await queue.drain()).left, 1); // timed out, stays queued
  assert.equal((await queue.drain()).left, 0); // re-upload, same id
  assert.equal(stored.size, 1);
});

test('saves are tallied for Home, with the ones that went to 미분류함 for quota, and handed over once', async () => {
  let state: QueueState = { jobs: [], receipts: [] };
  let n = 0;
  const queue = createShareQueue({
    load: async () => structuredClone(state),
    save: async (s) => {
      state = structuredClone(s);
    },
    copyIn: async (_uri, id) => `queue/${id}`,
    readBase64: async (uri) => uri,
    exists: () => true,
    remove: () => {},
    // the first two get sorted, the rest hit the month's limit
    upload: async () => ({ unclassifiedReason: n++ < 2 ? null : 'quota' }),
    consent: async () => 'agreed',
    tellMehh: () => {},
    now: () => 0,
    newId: () => `j${Math.random()}`,
  });
  await queue.enqueue(['a', 'b', 'c', 'd', 'e'], ['1', '2', '3', '4', '5']);
  await queue.drain();
  assert.deepEqual(await queue.takeUnreported(), { saved: 5, quota: 3 });
  assert.deepEqual(await queue.takeUnreported(), { saved: 0, quota: 0 });
});

test('server refuses a photo (too large): it stops at once, keeps its copy, and is said once', async () => {
  const t = setup('agreed', { failUpload: 1, failStatus: 413 });
  await t.queue.enqueue(['a'], ['101']);
  assert.deepEqual(await t.queue.drain(), { left: 0, waitingConsent: false });
  assert.equal(t.state().jobs[0].stopped, true);
  assert.equal(t.files.size, 1);
  assert.equal(await t.queue.waitingCount(), 0);
  assert.deepEqual(await t.queue.takeUnreported(), { saved: 0, quota: 0, failed: 1 });
  assert.deepEqual(await t.queue.takeUnreported(), { saved: 0, quota: 0 });
  // A later run doesn't try it again.
  await t.queue.drain();
  assert.equal(t.log.filter((l) => l.startsWith('upload')).length, 0);
});

test('a photo that keeps failing stops after MAX_ATTEMPTS runs', async () => {
  const t = setup('agreed', { failUpload: MAX_ATTEMPTS + 5 });
  await t.queue.enqueue(['a'], ['101']);
  for (let i = 1; i < MAX_ATTEMPTS; i++) assert.equal((await t.queue.drain()).left, 1);
  assert.deepEqual(await t.queue.drain(), { left: 0, waitingConsent: false });
  const [job] = t.state().jobs;
  assert.equal(job.stopped, true);
  assert.equal(job.attempts, MAX_ATTEMPTS);
  assert.equal(t.files.size, 1);
  assert.deepEqual(await t.queue.takeUnreported(), { saved: 0, quota: 0, failed: 1 });
});

test('a failure below the limit keeps retrying', async () => {
  const t = setup('agreed', { failUpload: 2, failStatus: 500 });
  await t.queue.enqueue(['a'], ['101']);
  assert.equal((await t.queue.drain()).left, 1);
  assert.equal((await t.queue.drain()).left, 1);
  assert.equal((await t.queue.drain()).left, 0);
  assert.deepEqual(await t.queue.takeUnreported(), { saved: 1, quota: 0 });
});
