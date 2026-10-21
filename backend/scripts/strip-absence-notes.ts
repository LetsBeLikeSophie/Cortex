// One-off: remove "no text visible" sentences ("글자는 보이지 않음", "화면에
// 읽을 수 있는 글자는 없습니다", ...) from AI memos saved before the
// classifier stopped writing them (anthropic.ts stripAbsentTextNotes).
//   npx.cmd tsx scripts/strip-absence-notes.ts            -> dry run: what would change
//   npx.cmd tsx scripts/strip-absence-notes.ts --confirm  -> write the changes
import "dotenv/config";
import { getClient } from "../src/lib/supabase.js";
import { stripAbsentTextNotes } from "../src/lib/anthropic.js";

const confirm = process.argv.includes("--confirm");
const changes: { id: string; before: string; after: string }[] = [];

for (let from = 0; ; from += 1000) {
  const { data, error } = await getClient()
    .from("items")
    .select("id, snippet")
    .not("snippet", "is", null)
    .order("id")
    .range(from, from + 999);
  if (error) throw error;
  for (const row of data ?? []) {
    const after = stripAbsentTextNotes(row.snippet as string);
    if (after !== row.snippet) changes.push({ id: row.id as string, before: row.snippet as string, after });
  }
  if (!data || data.length < 1000) break;
}

console.log(`${changes.length} memo(s) mention missing text${confirm ? "" : " (dry run -- add --confirm to write)"}`);
for (const c of changes.slice(0, 15)) console.log(`- ${c.before}\n  -> ${c.after || "(empty)"}`);

if (confirm) {
  for (const c of changes) {
    const { error } = await getClient().from("items").update({ snippet: c.after || null }).eq("id", c.id);
    if (error) throw error;
  }
  console.log(`updated ${changes.length}`);
}
