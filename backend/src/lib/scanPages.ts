// Search reads the whole archive, a page at a time, not just the newest 500
// (decision P2: a first-run import can add 100 photos at once). Bounded so a
// huge account can't hold the server; `enough` stops early once the caller
// has what it needs.
const SCAN_PAGE = 1000;
const SCAN_MAX = 20000;
export async function scanPages<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  keep: (row: T) => boolean,
  enough: (kept: number) => boolean = () => false
): Promise<T[]> {
  const kept: T[] = [];
  for (let from = 0; from < SCAN_MAX; from += SCAN_PAGE) {
    const { data, error } = await page(from, from + SCAN_PAGE - 1);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) if (keep(row)) kept.push(row);
    if ((data ?? []).length < SCAN_PAGE || enough(kept.length)) break;
  }
  return kept;
}
