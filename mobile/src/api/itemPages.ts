// The next page starts at the last row's own time (two rows can share one),
// so the row it repeats is dropped here.
export function appendPage<T extends { id: string }>(list: T[], page: T[]): T[] {
  const seen = new Set(list.map((it) => it.id));
  return [...list, ...page.filter((it) => !seen.has(it.id))];
}
