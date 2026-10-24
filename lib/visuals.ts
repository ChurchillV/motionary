import type { ConceptRow, GifRow } from "./db";
import type { GiphyEndpoint, GiphyItem } from "./giphy";
import { looksCaptioned } from "./giphy";
import { notoAnimatedCodepoint, notoUrls } from "./noto";
import type { Visual } from "./schemas";
import { glossHeadword } from "./text";

export type VisualNeed = {
  concept_id: string;
  english_gloss: string;
  kind: "gesture" | "item" | "other";
  emoji: string | null;
  search_terms: string[];
  role: "gesture" | "item";
  /** Other concepts whose curated GIF also fits (e.g. HELLO → WAVE). */
  alsoTry?: string[];
};

export type VisualStep = "exact" | "embedding" | "giphy" | "noto" | "emoji" | "none";

export type VisualDeps = {
  getConcept: (id: string) => Promise<ConceptRow | null>;
  findByAlias: (term: string) => Promise<ConceptRow | null>;
  approvedGifs: (conceptId: string) => Promise<(GifRow & { rank: number })[]>;
  embed: ((text: string) => Promise<number[]>) | null;
  matchConcepts: (embedding: number[], count: number, minSim: number) => Promise<{ concept_id: string; similarity: number }[]>;
  searchGiphy: ((endpoint: GiphyEndpoint, q: string) => Promise<GiphyItem[]>) | null;
  queueCuration: (conceptId: string, reason: string) => Promise<void>;
  random?: () => number;
  log?: (msg: string) => void;
};

export function gifRowToVisual(g: GifRow, role: Visual["role"]): Visual {
  const emoji =
    g.provider === "emoji" && g.provider_id
      ? String.fromCodePoint(...g.provider_id.split("_").map((h) => parseInt(h, 16)))
      : null;
  return {
    provider: g.provider,
    mp4: g.url_mp4,
    webp: g.url_webp,
    gif: g.url_gif,
    emoji,
    width: g.width ?? 1,
    height: g.height ?? 1,
    role,
  };
}

/** Random pick among the top 3 by rank. */
function pickTop3<T extends { rank: number }>(rows: T[], random: () => number): T | null {
  if (!rows.length) return null;
  const top = [...rows].sort((a, b) => a.rank - b.rank).slice(0, 3);
  return top[Math.floor(random() * top.length)] ?? top[0];
}

/** Section 9: the visual fallback chain. */
export async function resolveVisual(
  need: VisualNeed,
  deps: VisualDeps,
): Promise<{ visual: Visual | null; step: VisualStep; matchedConcept?: string }> {
  const random = deps.random ?? Math.random;
  const log = deps.log ?? (() => {});

  // 1. Exact match on concept id or alias.
  const exactIds = new Set<string>();
  const direct = await deps.getConcept(need.concept_id);
  if (direct) exactIds.add(direct.concept_id);
  // Alias lists only (not ids), so WAVE_WATER never borrows WAVE's GIF through the word "wave".
  const alias = await deps.findByAlias(glossHeadword(need.english_gloss));
  if (alias) exactIds.add(alias.concept_id);
  for (const id of need.alsoTry ?? []) exactIds.add(id);
  for (const id of exactIds) {
    const pick = pickTop3(await deps.approvedGifs(id), random);
    if (pick) return { visual: gifRowToVisual(pick, need.role), step: "exact", matchedConcept: id };
  }

  // 2. Embedding match on the English gloss.
  if (deps.embed) {
    try {
      const vector = await deps.embed(need.english_gloss);
      const matches = await deps.matchConcepts(vector, 3, 0.8);
      for (const m of matches) {
        if (m.concept_id === need.concept_id) continue;
        const pick = pickTop3(await deps.approvedGifs(m.concept_id), random);
        if (pick) return { visual: gifRowToVisual(pick, need.role), step: "embedding", matchedConcept: m.concept_id };
      }
    } catch (e) {
      log(`embedding match skipped: ${(e as Error).message}`);
    }
  }

  // 3. Live GIPHY fallback (cached, rate-limited, rating=g). Queue the concept for curation.
  if (deps.searchGiphy) {
    const endpoint: GiphyEndpoint = need.role === "gesture" ? "gifs" : "stickers";
    const terms = need.search_terms.length ? need.search_terms : [glossHeadword(need.english_gloss)];
    try {
      for (const term of terms.slice(0, 2)) {
        const hit = (await deps.searchGiphy(endpoint, term)).find((g) => !looksCaptioned(g.title) && (g.mp4 || g.webp));
        if (hit) {
          await deps.queueCuration(need.concept_id, "live GIPHY fallback used").catch(() => {});
          return {
            visual: {
              provider: "giphy",
              mp4: endpoint === "gifs" ? hit.mp4 : null,
              webp: hit.webp,
              gif: hit.gif,
              width: hit.width || 1,
              height: hit.height || 1,
              role: need.role,
            },
            step: "giphy",
          };
        }
      }
    } catch (e) {
      log(`live GIPHY skipped: ${(e as Error).message}`);
    }
  }

  // 4. Noto Animated Emoji.
  const emoji = need.emoji ?? direct?.emoji ?? alias?.emoji ?? null;
  const cp = notoAnimatedCodepoint(emoji);
  if (cp) {
    const urls = notoUrls(cp);
    return {
      visual: { provider: "noto", mp4: null, webp: urls.webp, gif: null, emoji, width: 512, height: 512, role: need.role },
      step: "noto",
    };
  }

  // 5. Static emoji.
  if (emoji) {
    return {
      visual: { provider: "emoji", mp4: null, webp: null, gif: null, emoji, width: 1, height: 1, role: need.role },
      step: "emoji",
    };
  }

  // 6. Nothing: the card shows without a picture.
  return { visual: null, step: "none" };
}
