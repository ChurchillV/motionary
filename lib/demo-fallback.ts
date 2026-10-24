import fallback from "@/data/demo-fallback.json";
import { RenderResult, ResolveResult } from "./schemas";

/** data/demo-fallback.json: used when an API is down or the Gemini key is missing. */
export function fallbackResolve(lang: string, textNormalized: string): ResolveResult | null {
  const raw = (fallback.resolves as Record<string, unknown>)[`${lang}:${textNormalized}`];
  const parsed = ResolveResult.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export function fallbackRender(conceptId: string, lang: string): RenderResult | null {
  const raw = (fallback.renders as Record<string, unknown>)[`${conceptId}:${lang}`];
  const parsed = RenderResult.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export function fallbackWords(lang: string): string[] {
  return Object.keys(fallback.resolves)
    .filter((k) => k.startsWith(`${lang}:`))
    .map((k) => k.slice(lang.length + 1));
}

/** A resolve result for a concept id (used when a "did you mean" chip is tapped offline). */
export function fallbackResolveById(conceptId: string): ResolveResult | null {
  const all = Object.values(fallback.resolves as Record<string, unknown>)
    .map((r) => ResolveResult.safeParse(r))
    .filter((p) => p.success)
    .map((p) => p.data!);
  const direct = all.find((r) => r.concept_id === conceptId);
  if (direct) return { ...direct, alternatives: [] };
  const alt = all.flatMap((r) => r.alternatives).find((a) => a.concept_id === conceptId);
  if (!alt) return null;
  return {
    concept_id: alt.concept_id, english_gloss: alt.english_gloss, kind: "item", gesture_id: null, item_concept_id: null,
    emoji: null, gif_search_terms: [], matched_form: null, alternatives: [], source: "model", confidence: "medium",
  };
}
