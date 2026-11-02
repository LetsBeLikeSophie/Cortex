// Deletes accounts one at a time from a list read again after each round
// (deleting removes a row, so the next read moves on). One account that keeps
// failing is logged and skipped for this run, so it can't hold up the rest.
export async function purgeEach(
  list: (skip: string[]) => Promise<string[]>,
  purge: (userId: string) => Promise<void>,
  onError: (userId: string, err: unknown) => void
): Promise<number> {
  const failed: string[] = [];
  let purged = 0;
  for (;;) {
    const userIds = await list(failed);
    if (userIds.length === 0) return purged;
    for (const userId of userIds) {
      try {
        await purge(userId);
        purged++;
      } catch (err) {
        failed.push(userId);
        onError(userId, err);
      }
    }
  }
}
