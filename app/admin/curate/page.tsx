import type { Metadata } from "next";
import { isAdmin } from "@/lib/admin";
import { repo } from "@/lib/db";
import { CurateGrid, type CurateRow } from "./CurateGrid";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Curate GIFs", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function CuratePage() {
  if (!(await isAdmin())) return <LoginForm />;

  const [concepts, approved, total] = await Promise.all([repo.listConcepts(), repo.conceptsWithApproved(), repo.countConcepts()]);
  const rows: CurateRow[] = [];
  for (const c of concepts) {
    if (approved.has(c.concept_id)) continue;
    const gifs = (await repo.gifsFor(c.concept_id)).filter((g) => g.provider === "giphy" && g.status === "candidate");
    if (!gifs.length) continue;
    // Screened candidates first (best score), then unscreened ones.
    gifs.sort((a, b) => (b.qa_score ?? 0) - (a.qa_score ?? 0) || a.rank - b.rank);
    rows.push({
      concept_id: c.concept_id,
      english_gloss: c.english_gloss,
      kind: c.kind,
      emoji: c.emoji,
      candidates: gifs.slice(0, 5).map((g) => ({
        gif_id: g.gif_id, mp4: g.url_mp4, webp: g.url_webp, qa_score: g.qa_score, qa_notes: g.qa_notes,
      })),
    });
  }

  return <CurateGrid rows={rows} approvedCount={approved.size} total={total} />;
}
