// The next page starts at the last row's own time (two rows can share one),
// so the row it repeats is dropped here.
export function appendPage<T extends { id: string }>(list: T[], page: T[]): T[] {
  const seen = new Set(list.map((it) => it.id));
  return [...list, ...page.filter((it) => !seen.has(it.id))];
}

const sameRow = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// A poll of the newest rows: they replace their old selves and anything new
// goes on top; rows paged in further down stay, so the list never shrinks
// under someone scrolling. Nothing changed gives back the same list.
export function mergeFirstPage<T extends { id: string }>(list: T[], page: T[]): T[] {
  const inPage = new Set(page.map((it) => it.id));
  const merged = [...page, ...list.filter((it) => !inPage.has(it.id))];
  const same = merged.length === list.length && page.every((it, i) => sameRow(it, list[i]));
  return same ? list : merged;
}

// A tab's newest rows, fresh: down to the page's oldest row the page is the
// truth (a memo that left the tab goes); older rows paged in stay.
export function replaceNewest<T extends { id: string; shared_at: string }>(list: T[], page: T[], pageSize: number): T[] {
  if (page.length < pageSize) return page;
  const inPage = new Set(page.map((it) => it.id));
  const oldest = Date.parse(page[page.length - 1].shared_at);
  return [...page, ...list.filter((it) => !inPage.has(it.id) && Date.parse(it.shared_at) < oldest)];
}

// Rows fetched one by one replace their old selves, where they are.
export function updateRows<T extends { id: string }>(list: T[], rows: T[]): T[] {
  const byId = new Map(rows.map((it) => [it.id, it]));
  const merged = list.map((it) => byId.get(it.id) ?? it);
  return merged.every((it, i) => it === list[i] || sameRow(it, list[i])) ? list : merged;
}
