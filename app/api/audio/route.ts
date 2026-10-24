import { NextResponse } from "next/server";
import { getAudio, textForAudio } from "@/lib/audio";
import { repo } from "@/lib/db";
import { ttsProviderFor } from "@/lib/languages";
import { SlidingWindowLimiter } from "@/lib/ratelimit";
import { AudioRequest } from "@/lib/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const perIp = new SlidingWindowLimiter(30, 60_000);

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
  if (!perIp.tryAcquire(ip)) {
    return NextResponse.json({ error: "Too many audio requests. Wait a moment." }, { status: 429 });
  }
  const parsed = AudioRequest.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Send { concept_id, lang, kind }" }, { status: 400 });
  const { concept_id, lang, kind } = parsed.data;

  if (ttsProviderFor(lang) === "none") {
    return NextResponse.json({ error: "No audio for this language yet" }, { status: 404 });
  }
  const text = await textForAudio(concept_id, lang, kind);
  if (!text) return NextResponse.json({ error: "Nothing to say for this word yet" }, { status: 404 });

  const clip = await getAudio(concept_id, lang, kind, text);
  if (repo.mode() === "local") repo.flush();
  if (!clip) return NextResponse.json({ error: "Audio is not available right now" }, { status: 503 });
  return NextResponse.json(clip);
}
