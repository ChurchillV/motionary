/** Fill emoji, aliases and search_terms with Gemini, 25 concepts per call. Skips concepts that have search terms. */
import "./_env";
import { config, hasGemini } from "@/lib/config";
import { repo } from "@/lib/db";
import { callModel } from "@/lib/gemini";
import { enrichPrompt } from "@/lib/prompts";
import { EnrichResult } from "@/lib/schemas";
import { generateValidated, PATIENT } from "@/lib/validated";
import { eta, run } from "./_util";

run("02-enrich-concepts", async () => {
  if (!hasGemini()) throw new Error("GEMINI_API_KEY is not set");
  const todo = (await repo.listConcepts()).filter((c) => !c.search_terms?.length);
  console.log(`${todo.length} concepts need enrichment`);
  const started = Date.now();
  for (let i = 0; i < todo.length; i += 25) {
    const batch = todo.slice(i, i + 25);
    try {
      const { value } = await generateValidated(callModel, enrichPrompt(batch), EnrichResult, {
        primary: config.visionModel,
        fallback: config.gemmaModel,
      }, PATIENT);
      const byId = new Map(value.concepts.map((c) => [c.concept_id, c]));
      for (const c of batch) {
        const e = byId.get(c.concept_id);
        if (!e) continue;
        await repo.updateConcept(c.concept_id, {
          emoji: c.emoji || e.emoji,
          aliases: [...new Set([...(c.aliases ?? []), ...e.aliases.map((a) => a.toLowerCase())])],
          search_terms: e.search_terms,
        });
      }
      repo.flush();
    } catch (err) {
      console.warn(`batch ${i / 25 + 1} failed, will retry next run: ${(err as Error).message}`);
    }
    const done = Math.min(i + 25, todo.length);
    console.log(`  ${done}/${todo.length} · ETA ${eta(done, todo.length, started)}`);
  }
});
