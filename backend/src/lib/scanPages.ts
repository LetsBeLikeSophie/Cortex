// Search reads the whole archive, a page at a time, not just the newest 500
// (decision P2: a first-run import can add 100 photos at once). Bounded so a
// huge account can't hold the server: small pages (a page of long screenshot
// texts is what sits in memory), and `pick` keeps only a slim copy of each
// match. `enough` stops early once the caller has what it needs.
const SCAN_PAGE = 200;
const SCAN_MAX = 20000;
export async function scanPages<T, K>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  pick: (row: T) => K | undefined,
  enough: (kept: number) => boolean = () => false
): Promise<K[]> {
  const kept: K[] = [];
  for (let from = 0; from < SCAN_MAX; from += SCAN_PAGE) {
    const { data, error } = await page(from, from + SCAN_PAGE - 1);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      const k = pick(row);
      if (k !== undefined) kept.push(k);
    }
    if ((data ?? []).length < SCAN_PAGE || enough(kept.length)) break;
  }
  return kept;
}
