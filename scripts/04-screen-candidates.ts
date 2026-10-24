/** Send each unscreened candidate's small MP4 to the vision model; screen out text, celebrities and low scores. */
import "./_env";
import { hasGemini } from "@/lib/config";
import { repo } from "@/lib/db";
import { screenGif } from "@/lib/gemini";
import { eta, run } from "./_util";

run("04-screen-candidates", async () => {
  if (!hasGemini()) throw new Error("GEMINI_API_KEY is not set");
  const todo = await repo.unscreenedCandidates(5000);
  console.log(`${todo.length} candidates to screen`);
  const started = Date.now();
  let kept = 0;
  for (const [i, { gif, concept }] of todo.entries()) {
    if (gif.has_text) {
      await repo.updateGif(gif.gif_id, { status: "screened_out", qa_score: 1, qa_notes: "caption words in title" });
      continue;
    }
    if (!gif.url_mp4) continue;
    try {
      const r = await screenGif(gif.url_mp4, concept.english_gloss, concept.kind);
      const out = r.has_text || r.real_celebrity || r.score < 3 || !r.matches;
      await repo.updateGif(gif.gif_id, {
        qa_score: r.score, has_text: r.has_text, qa_notes: r.notes.slice(0, 300),
        status: out ? "screened_out" : "candidate",
      });
      if (!out) kept++;
    } catch (e) {
      console.warn(`  ${concept.concept_id} ${gif.provider_id}: ${(e as Error).message}`);
    }
    if ((i + 1) % 10 === 0 || i + 1 === todo.length) {
      repo.flush();
      console.log(`  ${i + 1}/${todo.length} · kept ${kept} · ETA ${eta(i + 1, todo.length, started)}`);
    }
  }
});
