## Server rules (Sophie, 2026-11-01)

- A call to another service has a time limit and a limit on how much it reads, so a slow or huge answer can't stop the whole server.
- Changing billing code comes with tests for expiry, refund, resubscribing and after account deletion. Keep the rule itself pure, as in `src/lib/billingRules.ts`.
- Moving, deleting or merging lists of memos or files assumes one read doesn't return everything: page to the end.
- Sending memo content or tags to the AI checks that locked memos are left out.
- A request that can't be undone, like moving an account, clears what's needed to retry only after it has succeeded.

## Server rules (Sophie, 2026-11-02)

- Collecting something new about people (a new field, log or event) comes with a note, in the same change, of what the privacy policy and the Play data safety form need to say. It ships only after both are updated.
- A script that deletes data deletes only the targets named on its command line; with no target, or without `--confirm`, it only lists what it would delete.

## Server rules (Sophie, 2026-11-03)

- A change that makes the server read more rows filters in the database, not in server memory; if it's a feature anyone can call freely without spending a use, it comes with a rate limit.

## Server rules (Sophie, 2026-11-05)

- A new error answer from the server (like "already running") comes with, in the same change, what the app shows for it, so it never reaches people as a generic "something went wrong".
