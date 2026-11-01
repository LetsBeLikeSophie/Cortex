// At most `max` things run at a time; the rest wait their turn. Background work
// (a backlog of 2,000 memos, a restart's re-queue) only gets a slot when nothing
// in front of a person is waiting, so one backlog can't hold up everyone's saves.
export function createSlots(max: number) {
  let active = 0;
  const waiting: (() => void)[] = [];
  const waitingBackground: (() => void)[] = [];

  return async function withSlot<T>(fn: () => Promise<T>, background = false): Promise<T> {
    if (active >= max) await new Promise<void>((resolve) => (background ? waitingBackground : waiting).push(resolve));
    active++;
    try {
      return await fn();
    } finally {
      active--;
      (waiting.shift() ?? waitingBackground.shift())?.();
    }
  };
}
