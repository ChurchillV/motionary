/** Optional. Load data/lexicons/<iso639-3>.csv (english,form,notes) into lexicon_entries. */
import "./_env";
import fs from "node:fs";
import path from "node:path";
import { parseCsvLine, repo } from "@/lib/db";
import { getLanguage } from "@/lib/languages";
import { normalizeForMatch } from "@/lib/text";
import { run } from "./_util";

run("06-import-lexicon", async () => {
  const dir = "data/lexicons";
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".csv")) : [];
  if (!files.length) return console.log("No lexicon files in data/lexicons (optional; skipping).");
  for (const f of files) {
    const lang = path.basename(f, ".csv");
    if (!getLanguage(lang)) {
      console.warn(`  skipping ${f}: unknown language code`);
      continue;
    }
    const lines = fs.readFileSync(path.join(dir, f), "utf8").replace(/\r/g, "").split("\n").filter((l) => l.trim());
    const header = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
    const rows = lines.slice(1).map((l) => {
      const cells = parseCsvLine(l);
      const get = (k: string) => (cells[header.indexOf(k)] ?? "").trim();
      return { lang_code: lang, english: get("english"), form: get("form"), form_normalized: normalizeForMatch(get("form")), notes: get("notes") || null };
    }).filter((r) => r.english && r.form);
    await repo.replaceLexicon(lang, rows);
    await repo.setHasLexicon(lang, rows.length > 0);
    console.log(`  ${lang}: ${rows.length} entries`);
  }
});
