import { NextResponse } from "next/server";
import { LookupError, lookup, lookupFromFallback, type LookupInput } from "@/lib/lookup";
import { LookupRequest } from "@/lib/schemas";
import { repo } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Send JSON: { text, source_lang, target_lang }" }, { status: 400 });
  }
  const parsed = LookupRequest.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }
  const input: LookupInput = parsed.data;

  try {
    const res = await lookup(input);
    return NextResponse.json(res);
  } catch (e) {
    if (e instanceof LookupError && e.status === 400) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    // Any API or database trouble: try the demo snapshot before giving up.
    try {
      const offline = await lookupFromFallback(input);
      if (offline) return NextResponse.json(offline);
    } catch {}
    if (e instanceof LookupError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[lookup] unexpected error", e);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 502 });
  } finally {
    if (repo.mode() === "local") repo.flush();
  }
}
