// How long the PIN pad waits after wrong tries: free for the first few, then
// 30 seconds, doubling, at most an hour. Four digits are only 10,000 guesses.
const FREE_TRIES = 4;
const FIRST_WAIT_MS = 30_000;
const LONGEST_WAIT_MS = 60 * 60 * 1000;

export function pinWaitMs(wrongTries: number): number {
  if (wrongTries <= FREE_TRIES) return 0;
  return Math.min(FIRST_WAIT_MS * 2 ** (wrongTries - FREE_TRIES - 1), LONGEST_WAIT_MS);
}
