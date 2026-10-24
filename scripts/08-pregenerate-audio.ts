/**
 * For every demo language × concept with a translation, generate the word clip,
 * and the sentence clip for demo words. Idempotent: skips clips whose text_hash matches.
 * Usage: npm run audio [-- --langs spa,jpn] [-- --all-sentences]
 */
import "./_env";
import { getAudio, getCachedAudio } from "@/lib/audio";
import { hasGemini } from "@/lib/config";
import { repo } from "@/lib/db";
import fallback from "@/data/demo-fallback.json";
import { DEMO_LANGS, ttsProviderFor } from "@/lib/languages";
import { eta, run } from "./_util";

const arg = (name: string) => process.argv.find((a, i) => process.argv[i - 1] === name);
const langs = (arg("--langs")?.split(",") ?? [...DEMO_LANGS, "eng"]).filter((l) => ttsProviderFor(l) === "gemini");
const allSentences = process.argv.includes("--all-sentences");
const demoConcepts = new Set(Object.values(fallback.resolves).map((r) => r.concept_id));

run("08-pregenerate-audio", async () => {
  if (!hasGemini()) throw new Error("GEMINI_API_KEY is not set");
  const jobs: { concept: string; lang: string; kind: "word" | "sentence"; text: string }[] = [];
  for (const lang of langs) {
    for (const t of await repo.listTranslations(lang)) {
      jobs.push({ concept: t.concept_id, lang, kind: "word", text: t.form });
      if (t.example_target && (allSentences || demoConcepts.has(t.concept_id))) {
        jobs.push({ concept: t.concept_id, lang, kind: "sentence", text: t.example_target });
      }
    }
  }
  const todo = [];
  for (const j of jobs) if (!(await getCachedAudio(j.concept, j.lang, j.kind, j.text))) todo.push(j);
  console.log(`${jobs.length} clips wanted · ${todo.length} to generate (languages: ${langs.join(", ")})`);
  const started = Date.now();
  let failed = 0;
  for (const [i, j] of todo.entries()) {
    const clip = await getAudio(j.concept, j.lang, j.kind, j.text);
    if (!clip) failed++;
    repo.flush();
    console.log(`  ${i + 1}/${todo.length} ${j.lang} ${j.concept} ${j.kind} ${clip ? "✓" : "✗"} · ETA ${eta(i + 1, todo.length, started)}`);
  }
  if (failed) console.warn(`${failed} clips failed; re-run to retry.`);
});
