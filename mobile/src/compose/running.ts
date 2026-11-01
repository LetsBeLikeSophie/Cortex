import { useSyncExternalStore } from 'react';

// Which tags are being made into a memo right now. The request outlives its
// sheet, so Home can say it's still going after the sheet is closed.
let running: string[] = [];
const listeners = new Set<() => void>();

function set(next: string[]) {
  running = next;
  listeners.forEach((fn) => fn());
}

export function composeStarted(tag: string) {
  set([...running, tag]);
}

export function composeEnded(tag: string) {
  const i = running.indexOf(tag);
  if (i >= 0) set(running.filter((_, n) => n !== i));
}

export function useRunningComposes(): string[] {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => running
  );
}
