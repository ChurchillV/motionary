import { describe, expect, it, vi } from "vitest";
import type { ConceptRow, GifRow } from "@/lib/db";
import { resolveVisual, type VisualDeps, type VisualNeed } from "@/lib/visuals";

const concept = (id: string, extra: Partial<ConceptRow> = {}): ConceptRow => ({
  concept_id: id, english_gloss: id.toLowerCase(), kind: "item", emoji: null, aliases: [], search_terms: [], ...extra,
});
const gif = (id: string, provider: GifRow["provider"] = "giphy"): GifRow & { rank: number } => ({
  gif_id: id, provider, provider_id: id, url_mp4: `https://media/${id}.mp4`, url_webp: `https://media/${id}.webp`, url_gif: null,
  width: 480, height: 270, has_text: false, qa_score: 5, qa_notes: null, status: "approved", rank: 0,
});

function deps(over: Partial<VisualDeps> = {}): VisualDeps {
  return {
    getConcept: async () => null,
    findByAlias: async () => null,
    approvedGifs: async () => [],
    embed: null,
    matchConcepts: async () => [],
    searchGiphy: null,
    queueCuration: async () => {},
    random: () => 0,
    ...over,
  };
}

const need = (over: Partial<VisualNeed> = {}): VisualNeed => ({
  concept_id: "APPLE", english_gloss: "apple", kind: "item", emoji: "🍎", search_terms: ["apple"], role: "item", ...over,
});

describe("lookup fallback order", () => {
  it("1. exact curated GIF wins", async () => {
    const r = await resolveVisual(need(), deps({
      getConcept: async (id) => concept(id),
      approvedGifs: async (id) => (id === "APPLE" ? [gif("g1")] : []),
    }));
    expect(r.step).toBe("exact");
    expect(r.visual?.mp4).toContain("g1");
  });

  it("1b. a coined concept borrows a GIF through an alias", async () => {
    const r = await resolveVisual(need({ concept_id: "WAVING", english_gloss: "waving" }), deps({
      findByAlias: async (t) => (t === "waving" ? concept("WAVE") : null),
      approvedGifs: async (id) => (id === "WAVE" ? [gif("wave")] : []),
    }));
    expect(r).toMatchObject({ step: "exact", matchedConcept: "WAVE" });
  });

  it("2. embedding match (puppy → DOG) when no exact GIF", async () => {
    const r = await resolveVisual(need({ concept_id: "PUPPY", english_gloss: "puppy (young dog)" }), deps({
      getConcept: async (id) => concept(id),
      embed: async () => [1, 0],
      matchConcepts: async (_v, n, min) => {
        expect([n, min]).toEqual([3, 0.8]);
        return [{ concept_id: "PUPPY", similarity: 1 }, { concept_id: "DOG", similarity: 0.86 }];
      },
      approvedGifs: async (id) => (id === "DOG" ? [gif("dog")] : []),
    }));
    expect(r).toMatchObject({ step: "embedding", matchedConcept: "DOG" });
  });

  it("3. live GIPHY sticker, skipping captioned results, and queues curation", async () => {
    const queue = vi.fn(async () => {});
    const search = vi.fn(async () => [
      { id: "a", title: "Apple Text Quote", mp4: "x.mp4", webp: "x.webp", gif: null, width: 200, height: 200, smallMp4: null },
      { id: "b", title: "Red Apple Sticker", mp4: "b.mp4", webp: "b.webp", gif: null, width: 200, height: 200, smallMp4: null },
    ]);
    const r = await resolveVisual(need(), deps({ searchGiphy: search, queueCuration: queue }));
    expect(r.step).toBe("giphy");
    expect(r.visual?.webp).toBe("b.webp");
    expect(r.visual?.mp4).toBeNull(); // stickers use WebP (transparent)
    expect(search).toHaveBeenCalledWith("stickers", "apple");
    expect(queue).toHaveBeenCalledWith("APPLE", expect.any(String));
  });

  it("3b. gestures search the GIFs endpoint", async () => {
    const search = vi.fn(async () => []);
    await resolveVisual(need({ concept_id: "WAVE", role: "gesture", kind: "gesture", search_terms: ["waving"] }), deps({ searchGiphy: search }));
    expect(search).toHaveBeenCalledWith("gifs", "waving");
  });

  it("4. Noto animated emoji when GIPHY has nothing", async () => {
    const r = await resolveVisual(need(), deps({ searchGiphy: async () => [] }));
    expect(r.step).toBe("noto");
    expect(r.visual?.webp).toContain("/1f34e/512.webp");
  });

  it("5. static emoji when there is no animation", async () => {
    const r = await resolveVisual(need({ emoji: "☀️" }), deps());
    expect(r).toMatchObject({ step: "emoji", visual: { provider: "emoji", emoji: "☀️" } });
  });

  it("6. nothing at all for a nonsense word", async () => {
    const r = await resolveVisual(need({ emoji: null }), deps());
    expect(r).toEqual({ visual: null, step: "none" });
  });

  it("errors in embedding or GIPHY never break the chain", async () => {
    const r = await resolveVisual(need(), deps({
      embed: async () => { throw new Error("down"); },
      searchGiphy: async () => { throw new Error("429"); },
    }));
    expect(r.step).toBe("noto");
  });

  it("WAVE_WATER does not borrow WAVE's GIF via the word 'wave'", async () => {
    const r = await resolveVisual(need({ concept_id: "WAVE_WATER", english_gloss: "wave (of the sea)", emoji: "🌊" }), deps({
      getConcept: async (id) => concept(id),
      findByAlias: async () => null,
      approvedGifs: async (id) => (id === "WAVE" ? [gif("hand")] : []),
    }));
    expect(r.step).not.toBe("exact");
  });
});
