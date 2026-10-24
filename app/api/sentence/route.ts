import { NextResponse } from "next/server";
import { repo } from "@/lib/db";
import { LookupError } from "@/lib/lookup";
import { SentenceRequest } from "@/lib/schemas";
import { translateSentence } from "@/lib/sentence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const parsed = SentenceRequest.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Send { text, source_lang, target_lang }" }, { status: 400 });
  }
  try {
    return NextResponse.json(await translateSentence(parsed.data));
  } catch (e) {
    if (e instanceof LookupError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[sentence] unexpected error", e);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 502 });
  } finally {
    if (repo.mode() === "local") repo.flush();
  }
}
