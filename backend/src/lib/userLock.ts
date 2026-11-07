// One run per person at a time for a metered AI job: a second request while
// the first is still running is turned away before any "uses left" check,
// so parallel taps can't all pass the check or spend two uses.
export async function withUserLock<T>(running: Set<string>, userId: string, fn: () => Promise<T>): Promise<{ busy: true } | { busy: false; value: T }> {
  if (running.has(userId)) return { busy: true };
  running.add(userId);
  try {
    return { busy: false, value: await fn() };
  } finally {
    running.delete(userId);
  }
}
