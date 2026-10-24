/**
 * For each concept without an approved GIF, search GIPHY per search term
 * (gifs for gestures, stickers for items; rating=g, limit=10) and store results as candidates.
 * Honours GIPHY_CALLS_PER_HOUR: waits for the window when the budget is spent; stops on HTTP 429.
 */
import "./_env";
import { hasGiphy } from "@/lib/config";
import { repo } from "@/lib/db";
import { GiphyRateLimitError, giphyLimiter, looksCaptioned, searchGiphy } from "@/lib/giphy";
import { glossHeadword } from "@/lib/text";
import { eta, run, sleep } from "./_util";

const WAIT_FOR_BUDGET = !process.argv.includes("--no-wait");

run("03-search-giphy", async () => {
  if (!hasGiphy()) throw new Error("GIPHY_API_KEY is not set");
  const approved = await repo.conceptsWithApproved();
  const concepts = (await repo.listConcepts()).filter((c) => !approved.has(c.concept_id));
  // Skip concepts that already have candidates (resumable).
  const todo = [];
  for (const c of concepts) if (!(await repo.gifsFor(c.concept_id)).some((g) => g.provider === "giphy")) todo.push(c);
  const calls = todo.reduce((n, c) => n + Math.max(1, Math.min(3, c.search_terms?.length ?? 0)), 0);
  console.log(`${todo.length} concepts to search · ~${calls} GIPHY calls (cached calls are free)`);

  const started = Date.now();
  for (const [i, c] of todo.entries()) {
    const endpoint = c.kind === "gesture" ? "gifs" : "stickers";
    const terms = (c.search_terms?.length ? c.search_terms : [glossHeadword(c.english_gloss)]).slice(0, 3);
    let rank = 0;
    for (const term of terms) {
      for (;;) {
        try {
          const items = await searchGiphy(endpoint, term, 10);
          for (const it of items) {
            if (!it.mp4 && !it.webp) continue;
            const gifId = await repo.upsertGif({
              provider: "giphy", provider_id: it.id, url_mp4: it.mp4 ?? it.smallMp4, url_webp: it.webp, url_gif: it.gif,
              width: it.width, height: it.height, has_text: looksCaptioned(it.title) ? true : null,
              qa_score: null, qa_notes: it.title.slice(0, 200) || null,
            });
            await repo.linkConceptGif(c.concept_id, gifId, rank++);
          }
          break;
        } catch (e) {
          if (e instanceof GiphyRateLimitError) {
            if (e.fromServer || !WAIT_FOR_BUDGET) {
              repo.flush();
              throw new Error(`${e.message}. Stopped with ${todo.length - i} concepts left; re-run later to resume.`);
            }
            const wait = giphyLimiter.msUntilAvailable() + 1000;
            console.log(`  budget spent, waiting ${Math.ceil(wait / 60000)} min…`);
            repo.flush();
            await sleep(wait);
            continue;
          }
          console.warn(`  ${c.concept_id} "${term}" failed: ${(e as Error).message}`);
          break;
        }
      }
    }
    repo.flush();
    console.log(`  ${i + 1}/${todo.length} ${c.concept_id} · ${rank} candidates · budget left ${giphyLimiter.remaining()} · ETA ${eta(i + 1, todo.length, started)}`);
  }
});
