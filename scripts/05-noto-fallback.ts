/**
 * For concepts with no approved visual and no candidates left to review, add a
 * Noto Animated Emoji (copied into storage) or a static emoji row.
 * Pass --all to also cover concepts that still have unreviewed candidates.
 */
import "./_env";
import { applyNotoFallback } from "@/lib/curation";
import { repo } from "@/lib/db";
import { run } from "./_util";

const ALL = process.argv.includes("--all");

run("05-noto-fallback", async () => {
  const approved = await repo.conceptsWithApproved();
  const counts = { noto: 0, emoji: 0, none: 0, waiting: 0 };
  for (const c of await repo.listConcepts()) {
    if (approved.has(c.concept_id)) continue;
    if (!ALL && (await repo.gifsFor(c.concept_id)).some((g) => g.status === "candidate")) {
      counts.waiting++;
      continue;
    }
    counts[await applyNotoFallback(c, { copyToStorage: true })]++;
  }
  console.log(`noto ${counts.noto} · static emoji ${counts.emoji} · no emoji ${counts.none} · still awaiting review ${counts.waiting}`);
  const total = await repo.countConcepts();
  console.log(`concepts with an approved visual: ${(await repo.conceptsWithApproved()).size}/${total}`);
});
