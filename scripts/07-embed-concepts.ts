/** Fill concepts.embedding for rows missing it. */
import "./_env";
import { hasGemini } from "@/lib/config";
import { repo } from "@/lib/db";
import { embed } from "@/lib/gemini";
import { eta, run } from "./_util";

run("07-embed-concepts", async () => {
  if (!hasGemini()) throw new Error("GEMINI_API_KEY is not set");
  const todo = await repo.conceptsMissingEmbedding();
  console.log(`${todo.length} concepts to embed`);
  const started = Date.now();
  for (const [i, c] of todo.entries()) {
    try {
      await repo.updateConcept(c.concept_id, { embedding: await embed(c.english_gloss) });
    } catch (e) {
      console.warn(`  ${c.concept_id}: ${(e as Error).message}`);
    }
    if ((i + 1) % 25 === 0 || i + 1 === todo.length) {
      repo.flush();
      console.log(`  ${i + 1}/${todo.length} · ETA ${eta(i + 1, todo.length, started)}`);
    }
  }
});
