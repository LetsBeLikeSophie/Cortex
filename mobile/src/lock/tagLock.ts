import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { fetchLockedTags } from '../api/client';

// Tag lock (Sophie, 2026-11-07): a locked tag's memos are hidden from Home
// and search until the memo-lock PIN opens them. One PIN entry opens every
// locked tag until the app goes to the background. Which tags are locked
// lives on the server (it also locks the memos, so AI leaves them out); the
// open/closed state is only on this device.

type State = { tags: Set<string>; open: boolean; limit: number | null };
let state: State = { tags: new Set(), open: false, limit: null };
const listeners = new Set<(s: State) => void>();

function set(next: Partial<State>) {
  state = { ...state, ...next };
  listeners.forEach((fn) => fn(state));
}

AppState.addEventListener('change', (s) => {
  if (s === 'background' && state.open) set({ open: false });
});

export function refreshLockedTags(): Promise<void> {
  return fetchLockedTags()
    .then((r) => set({ tags: new Set(r.tags), limit: r.limit }))
    // An older server without tag lock: nothing is locked.
    .catch(() => {});
}

export function setLockedTags(tags: string[]) {
  set({ tags: new Set(tags) });
}

export function openTags() {
  set({ open: true });
}

export function closeTags() {
  set({ open: false });
}

export function tagsOpen(): boolean {
  return state.open;
}

// A memo the person shouldn't see right now: locked by a tag, tags closed.
export function hiddenByTagLock(item: { locked_by_tag?: boolean }): boolean {
  return !!item.locked_by_tag && !state.open;
}

export function useTagLock(): State {
  const [s, setS] = useState(state);
  useEffect(() => {
    listeners.add(setS);
    setS(state);
    return () => {
      listeners.delete(setS);
    };
  }, []);
  return s;
}
