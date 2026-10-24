import { repo } from "@/lib/db";

export const runtime = "nodejs";

const TYPES: Record<string, string> = { wav: "audio/wav", mp3: "audio/mpeg", ogg: "audio/ogg", webp: "image/webp", gif: "image/gif", json: "application/json" };

/** Local mode only: serves files that would live in Supabase Storage. */
export async function GET(_req: Request, ctx: RouteContext<"/api/storage/[...path]">) {
  if (repo.mode() !== "local") return new Response("Not found", { status: 404 });
  const { path } = await ctx.params;
  const storagePath = path.map(decodeURIComponent).join("/");
  const file = repo.readLocalFile(storagePath);
  if (!file) return new Response("Not found", { status: 404 });
  const ext = storagePath.split(".").pop() ?? "";
  return new Response(new Uint8Array(file), {
    headers: { "Content-Type": TYPES[ext] ?? "application/octet-stream", "Cache-Control": "public, max-age=31536000, immutable" },
  });
}
