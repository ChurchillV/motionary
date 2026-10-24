/**
 * Runs the demo script (section 13) against an API and prints pass/fail.
 * Also pre-warms caches for the demo.
 *   npm run smoke                         # http://localhost:3000
 *   BASE_URL=https://your.app npm run smoke
 *   npm run smoke -- --snapshot           # also rewrite data/demo-fallback.json from live answers
 */
import "./_env";
import fs from "node:fs";
import type { LookupResponse } from "@/lib/schemas";
import { normalizeForMatch } from "@/lib/text";

const BASE = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const SNAPSHOT = process.argv.includes("--snapshot");
const [L1, L2] = ["spa", "jpn"];

type Check = { name: string; req: { text: string; source_lang: string; target_lang: string; concept_id?: string }; expect: (r: LookupResponse) => string | null };

const hasVisual = (r: LookupResponse) => (r.visuals.length ? null : "no visual");

const checks: Check[] = [
  { name: "1. wave → L1 gesture", req: { text: "wave", source_lang: "eng", target_lang: L1 },
    expect: (r) => (r.concept_id !== "WAVE" ? `concept ${r.concept_id}` : !r.example ? "no example" : hasVisual(r)) },
  { name: "2. apple → item", req: { text: "apple", source_lang: "eng", target_lang: L1 },
    expect: (r) => (r.kind !== "item" ? `kind ${r.kind}` : hasVisual(r)) },
  { name: "3. eat apple → combo", req: { text: "eat apple", source_lang: "eng", target_lang: L1 },
    expect: (r) => (r.visuals.length === 2 && r.visuals[0].role === "gesture" && r.visuals[1].role === "item" ? null : `visuals ${r.visuals.map((v) => v.role).join("+")}`) },
  { name: "4. puppy → visual (DOG via embedding when curated)", req: { text: "puppy", source_lang: "eng", target_lang: L1 }, expect: hasVisual },
  { name: "5. uncurated word renders", req: { text: "kite", source_lang: "eng", target_lang: L1 }, expect: () => null },
  { name: "6. wave → L2", req: { text: "wave", source_lang: "eng", target_lang: L2 },
    expect: (r) => (r.concept_id !== "WAVE" ? `concept ${r.concept_id}` : r.target.romanization ? null : "no romanization") },
  { name: "7. L1 'agua' → English", req: { text: "agua", source_lang: L1, target_lang: "eng" },
    expect: (r) => (r.concept_id === "WATER" && /water/i.test(r.target.form) ? null : `${r.concept_id} / ${r.target.form}`) },
  { name: "8. L1 → L2 direct", req: { text: "manzana", source_lang: L1, target_lang: L2 },
    expect: (r) => (r.concept_id === "APPLE" ? null : `concept ${r.concept_id}`) },
  { name: "9. bat → did you mean", req: { text: "bat", source_lang: "eng", target_lang: L1 },
    expect: (r) => (r.alternatives.length ? null : "no alternatives") },
  { name: "9b. tap alternative", req: { text: "bat", source_lang: "eng", target_lang: L1, concept_id: "BAT_SPORTS" },
    expect: (r) => (r.concept_id === "BAT_SPORTS" ? null : `concept ${r.concept_id}`) },
  { name: "M2. accents optional (cafe)", req: { text: "cafe", source_lang: L1, target_lang: "eng" }, expect: () => null },
  { name: "extra: water → L1", req: { text: "water", source_lang: "eng", target_lang: L1 }, expect: () => null },
  { name: "extra: water → L2", req: { text: "water", source_lang: "eng", target_lang: L2 }, expect: () => null },
  { name: "extra: hello → L1", req: { text: "hello", source_lang: "eng", target_lang: L1 }, expect: () => null },
  { name: "extra: hello → L2", req: { text: "hello", source_lang: "eng", target_lang: L2 }, expect: () => null },
];

async function post(path: string, body: unknown) {
  const started = Date.now();
  const res = await fetch(`${BASE}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => ({})), ms: Date.now() - started };
}

async function main() {
  console.log(`Smoke test against ${BASE}\n`);
  let failed = 0;
  let skipped = 0;
  const responses: LookupResponse[] = [];
  for (const c of checks) {
    const { status, body, ms } = await post("/api/lookup", c.req);
    if (status === 503) {
      skipped++;
      console.log(`- ${c.name}  skipped: ${body.error ?? "service offline"} (set GEMINI_API_KEY)`);
      continue;
    }
    const problem = status !== 200 ? `HTTP ${status}: ${body.error ?? ""}` : c.expect(body);
    if (problem) failed++;
    else responses.push(body);
    const repeat = status === 200 ? await post("/api/lookup", c.req) : null;
    const flags = status === 200 ? ` [${(body as LookupResponse).visuals.map((v) => v.provider).join("+") || "no visual"}${body.offline ? ", offline" : ""}]` : "";
    console.log(`${problem ? "✗" : "✓"} ${c.name}  ${ms} ms${repeat ? ` · repeat ${repeat.ms} ms` : ""}${flags}${problem ? `  → ${problem}` : ""}`);
  }

  // 10. Audio on a demo card.
  const wave = responses.find((r) => r.concept_id === "WAVE" && r.target_lang === L1);
  if (wave?.audio.available) {
    for (const kind of ["word", "sentence"] as const) {
      const { status, ms } = await post("/api/audio", { concept_id: "WAVE", lang: L1, kind });
      if (status === 503) {
        skipped++;
        console.log(`- 10. audio (${kind})  skipped: TTS unavailable (set GEMINI_API_KEY)`);
        continue;
      }
      if (status !== 200) failed++;
      console.log(`${status === 200 ? "✓" : "✗"} 10. audio (${kind})  ${ms} ms${status !== 200 ? `  → HTTP ${status}` : ""}`);
    }
  }

  if (SNAPSHOT) {
    const file = "data/demo-fallback.json";
    const snap = JSON.parse(fs.readFileSync(file, "utf8"));
    for (const r of responses.filter((x) => !x.offline)) {
      const req = checks.find((c) => c.req.text === r.source.text && c.req.source_lang === r.source.lang)?.req;
      const key = `${r.source.lang}:${normalizeForMatch(r.source.text)}`;
      // Combos keep their hand-written gesture/item split; the response doesn't carry it.
      const isCombo = r.visuals.length === 2;
      if (req && !req.concept_id && !(isCombo && snap.resolves[key])) {
        snap.resolves[key] = {
          concept_id: r.concept_id, english_gloss: r.english_gloss, kind: r.kind,
          gesture_id: r.kind === "gesture" ? r.concept_id : null,
          item_concept_id: null,
          emoji: r.emoji, gif_search_terms: [], matched_form: r.source.matched_form,
          alternatives: r.alternatives.map(({ concept_id, english_gloss }) => ({ concept_id, english_gloss })),
          source: "model", confidence: r.confidence,
        };
      }
      snap.renders[`${r.concept_id}:${r.target_lang}`] = {
        target: r.target, example_sentence: r.example ?? { target: "", english: "" }, source: "model", confidence: r.confidence,
      };
    }
    fs.writeFileSync(file, JSON.stringify(snap, null, 2) + "\n");
    console.log(`\nSnapshot written to ${file}`);
  }

  console.log(`\n${failed ? `${failed} failed` : "All passed"}${skipped ? ` (${skipped} skipped)` : ""}`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
