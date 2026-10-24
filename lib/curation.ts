import { repo, type ConceptRow } from "./db";
import { emojiToCodepoint, notoAnimatedCodepoint, notoUrls } from "./noto";

/**
 * Give a concept with no approved GIF a Noto Animated Emoji (copied into
 * storage when possible), or a static emoji row if no animation exists.
 */
export async function applyNotoFallback(concept: ConceptRow, opts: { copyToStorage?: boolean } = {}): Promise<"noto" | "emoji" | "none"> {
  if (!concept.emoji) return "none";
  const cp = notoAnimatedCodepoint(concept.emoji);
  if (cp) {
    let webp = notoUrls(cp).webp;
    if (opts.copyToStorage) {
      try {
        const res = await fetch(webp, { signal: AbortSignal.timeout(10_000) });
        if (res.ok) {
          const path = `noto/${cp}/512.webp`;
          await repo.uploadFile(path, Buffer.from(await res.arrayBuffer()), "image/webp");
          webp = repo.publicUrl(path);
        }
      } catch (e) {
        console.warn(`[noto] could not copy ${cp}, linking to gstatic instead: ${(e as Error).message}`);
      }
    }
    const gifId = await repo.upsertGif({
      provider: "noto", provider_id: cp, url_mp4: null, url_webp: webp, url_gif: null,
      width: 512, height: 512, has_text: false, qa_score: null, qa_notes: "Noto Animated Emoji", status: "approved",
    });
    await repo.updateGif(gifId, { status: "approved", url_webp: webp });
    await repo.linkConceptGif(concept.concept_id, gifId, 10);
    return "noto";
  }
  const gifId = await repo.upsertGif({
    provider: "emoji", provider_id: emojiToCodepoint(concept.emoji), url_mp4: null, url_webp: null, url_gif: null,
    width: 1, height: 1, has_text: false, qa_score: null, qa_notes: "static emoji", status: "approved",
  });
  await repo.updateGif(gifId, { status: "approved" });
  await repo.linkConceptGif(concept.concept_id, gifId, 20);
  return "emoji";
}
