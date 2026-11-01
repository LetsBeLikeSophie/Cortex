// A tag as a Postgres array literal, for an array filter. The client library's
// own array form doesn't quote, so a tag with a comma would turn into two tags.
export function tagArrayLiteral(tag: string): string {
  return `{"${tag.replace(/[\\"]/g, "\\$&")}"}`;
}

// The newest `max` of two newest-first lists; a memo can be in both.
export function newestOfBoth<T extends { id: string; shared_at: string }>(a: T[], b: T[], max: number): T[] {
  const byId = new Map([...a, ...b].map((it) => [it.id, it]));
  return [...byId.values()].sort((x, y) => Date.parse(y.shared_at) - Date.parse(x.shared_at)).slice(0, max);
}
