import { NextResponse } from "next/server";
import { repo } from "@/lib/db";
import { VisualsRequest } from "@/lib/schemas";
import { visualForEnglish } from "@/lib/word-visuals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST { words: ["drink", "water"] } → pictures for the sentence word deck. */
export async function POST(req: Request) {
  const parsed = VisualsRequest.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Send { words: string[] } (1–5 words)" }, { status: 400 });
  const results = await Promise.all(
    parsed.data.words.map((w) =>
      visualForEnglish(w).catch((e) => {
        console.warn(`[visuals] ${w}: ${(e as Error).message}`);
        return { english: w, visual: null, emoji: null };
      }),
    ),
  );
  if (repo.mode() === "local") repo.flush();
  return NextResponse.json(results);
}
