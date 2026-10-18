// Deletes test accounts in bulk, using the same deleteUserAccount() the app's
// "계정 삭제" uses (screenshots in Storage, items, plan + usage rows, Kakao
// mapping, then the auth user). Pseudonymized analytics stay, as they do
// for a normal account deletion.
//
// Dry run by default -- it only lists what WOULD be deleted:
//   npx tsx scripts/cleanup-accounts.ts
// Keep some accounts (repeatable), e.g. the phone you still test with:
//   npx tsx scripts/cleanup-accounts.ts --keep <user-id> --keep <user-id>
// Actually delete (irreversible):
//   npx tsx scripts/cleanup-accounts.ts --keep <user-id> --confirm
import "dotenv/config";
import { deleteUserAccount, getClient } from "../src/lib/supabase.js";

const args = process.argv.slice(2);
const confirm = args.includes("--confirm");
const keep = new Set<string>();
args.forEach((a, i) => {
  if (a === "--keep" && args[i + 1]) keep.add(args[i + 1]);
});

const client = getClient();

// Every auth user, paged.
const users: { id: string; anonymous: boolean; created: string }[] = [];
for (let page = 1; ; page++) {
  const { data, error } = await client.auth.admin.listUsers({ page, perPage: 200 });
  if (error) throw error;
  for (const u of data.users) users.push({ id: u.id, anonymous: !!u.is_anonymous, created: u.created_at.slice(0, 10) });
  if (data.users.length < 200) break;
}

const { data: items, error: itemsError } = await client.from("items").select("user_id").limit(100000);
if (itemsError) throw itemsError;
const counts = new Map<string, number>();
for (const r of items ?? []) counts.set(r.user_id, (counts.get(r.user_id) ?? 0) + 1);

const doomed = users.filter((u) => !keep.has(u.id));
console.log(`accounts: ${users.length} total, keeping ${users.length - doomed.length}, deleting ${doomed.length}\n`);
for (const u of users) {
  const mark = keep.has(u.id) ? "KEEP  " : "DELETE";
  console.log(`${mark} ${u.id}  ${u.anonymous ? "guest " : "kakao "} joined ${u.created}  items ${counts.get(u.id) ?? 0}`);
}
for (const id of keep) if (!users.some((u) => u.id === id)) console.log(`\n(warning: --keep ${id} matches no account)`);

if (!confirm) {
  console.log("\nDry run -- nothing deleted. Re-run with --confirm to delete the DELETE rows.");
  process.exit(0);
}

let ok = 0;
for (const u of doomed) {
  try {
    await deleteUserAccount(u.id);
    ok++;
    console.log(`deleted ${u.id}`);
  } catch (err) {
    console.error(`FAILED ${u.id}:`, err instanceof Error ? err.message : err);
  }
}
console.log(`\ndone: ${ok}/${doomed.length} deleted`);
