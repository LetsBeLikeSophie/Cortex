// Deletes the accounts named here, using the same deleteUserAccount() the
// app's "계정 삭제" uses (screenshots in Storage, items, plan + usage rows, Kakao
// mapping, then the auth user). Pseudonymized analytics stay, as they do
// for a normal account deletion.
//
// With no arguments it only lists every account:
//   npx tsx scripts/cleanup-accounts.ts
// Show what would go (repeatable):
//   npx tsx scripts/cleanup-accounts.ts --delete <user-id> --delete <user-id>
// Actually delete (irreversible):
//   npx tsx scripts/cleanup-accounts.ts --delete <user-id> --confirm
import "dotenv/config";
import { deleteUserAccount, getClient } from "../src/lib/supabase.js";

const args = process.argv.slice(2);
const confirm = args.includes("--confirm");
const named = new Set<string>();
args.forEach((a, i) => {
  if (a === "--delete" && args[i + 1]) named.add(args[i + 1]);
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

async function itemCount(userId: string): Promise<number> {
  const { count, error } = await client.from("items").select("id", { count: "exact", head: true }).eq("user_id", userId);
  if (error) throw error;
  return count ?? 0;
}

const unknown = [...named].filter((id) => !users.some((u) => u.id === id));
if (unknown.length > 0) {
  console.error(`No such account, nothing deleted: ${unknown.join(", ")}`);
  process.exit(1);
}

const doomed = users.filter((u) => named.has(u.id));
console.log(`accounts: ${users.length} total, deleting ${doomed.length}\n`);
for (const u of users) {
  const mark = named.has(u.id) ? "DELETE" : "      ";
  console.log(`${mark} ${u.id}  ${u.anonymous ? "guest  " : "account"} joined ${u.created}  items ${await itemCount(u.id)}`);
}

if (doomed.length === 0) {
  console.log("\nNothing deleted. Name accounts with --delete <user-id>.");
  process.exit(0);
}
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
