import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdmin } from "@/lib/admin";
import { applyNotoFallback } from "@/lib/curation";
import { repo } from "@/lib/db";

export const runtime = "nodejs";

const Body = z.object({
  concept_id: z.string().min(1),
  /** The chosen gif, or null for "none good" (x key). */
  gif_id: z.string().nullable(),
});

export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Send { concept_id, gif_id }" }, { status: 400 });
  const { concept_id, gif_id } = parsed.data;

  const concept = await repo.getConcept(concept_id);
  if (!concept) return NextResponse.json({ error: "Unknown concept" }, { status: 404 });

  let result: string;
  if (gif_id) {
    const linked = await repo.gifsFor(concept_id);
    if (!linked.some((g) => g.gif_id === gif_id)) {
      return NextResponse.json({ error: "That GIF is not a candidate for this concept" }, { status: 400 });
    }
    await repo.approveGif(concept_id, gif_id);
    result = "approved";
  } else {
    await repo.rejectCandidatesFor(concept_id);
    result = await applyNotoFallback(concept, { copyToStorage: true });
  }
  if (repo.mode() === "local") repo.flush();
  return NextResponse.json({ ok: true, result });
}
