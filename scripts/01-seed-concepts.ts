/** Load data/seed-concepts.csv into concepts. Existing rows are left alone. */
import "./_env";
import fs from "node:fs";
import { parseSeedCsv, repo } from "@/lib/db";
import { run } from "./_util";

run("01-seed-concepts", async () => {
  const rows = parseSeedCsv(fs.readFileSync("data/seed-concepts.csv", "utf8"));
  const bad = rows.filter((r) => !/^[A-Z][A-Z0-9_]*$/.test(r.concept_id) || !["gesture", "item", "other"].includes(r.kind));
  if (bad.length) throw new Error(`Bad rows: ${bad.map((r) => r.concept_id).join(", ")}`);
  let inserted = 0;
  for (let i = 0; i < rows.length; i += 200) inserted += await repo.insertConceptsIfMissing(rows.slice(i, i + 200));
  // Fill emoji/aliases from the CSV where the database has none yet.
  const existing = new Map((await repo.listConcepts()).map((c) => [c.concept_id, c]));
  let patched = 0;
  for (const r of rows) {
    const cur = existing.get(r.concept_id);
    if (!cur) continue;
    const patch: Record<string, unknown> = {};
    if (!cur.emoji && r.emoji) patch.emoji = r.emoji;
    if (!cur.aliases?.length && r.aliases.length) patch.aliases = r.aliases;
    if (Object.keys(patch).length) {
      await repo.updateConcept(r.concept_id, patch);
      patched++;
    }
  }
  console.log(`${rows.length} rows in CSV · ${inserted} inserted · ${patched} filled in · ${existing.size} concepts total`);
});
