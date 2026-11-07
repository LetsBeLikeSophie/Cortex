// Tag lock (Sophie, 2026-11-07): a whole tag opens only with the memo-lock
// PIN. Every memo carrying a locked tag is locked like a memo locked by
// hand (so AI, compose and reminders already leave it out), and
// `locked_by_tag` remembers that the tag did it -- unlocking the tag then
// opens only those, never a memo the person locked themselves.

// Free keeps one locked tag; Pro and the trial have no limit. Going back to
// free never opens a tag that is already locked -- only a new one is refused.
export const FREE_LOCKED_TAGS = 1;

export function canLockAnotherTag(tier: "free" | "trial" | "pro", lockedCount: number): boolean {
  return tier !== "free" || lockedCount < FREE_LOCKED_TAGS;
}

export interface LockState {
  tags: string[];
  user_tags: string[];
  locked?: boolean;
  locked_by_tag?: boolean;
}

// What a memo's lock should become after its tags or the locked tags
// changed; null when nothing changes. A memo locked by hand stays as it is.
export function tagLockChange(item: LockState, lockedTags: Iterable<string>): { locked: boolean; locked_by_tag: boolean } | null {
  const set = new Set(lockedTags);
  const inLockedTag = [...item.tags, ...item.user_tags].some((t) => set.has(t));
  const locked = !!item.locked;
  const byTag = !!item.locked_by_tag;
  if (inLockedTag && !locked) return { locked: true, locked_by_tag: true };
  if (!inLockedTag && locked && byTag) return { locked: false, locked_by_tag: false };
  return null;
}
