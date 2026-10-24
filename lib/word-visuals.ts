/**
 * Pictures for sentence key words, from their English meaning only.
 * No Gemma calls: library match → embedding match → GIPHY → Noto → emoji.
 */
import { repo } from "./db";
import { visualDeps } from "./lookup";
import type { WordVisual } from "./schemas";
import { glossHeadword, normalizeForMatch } from "./text";
import { resolveVisual } from "./visuals";

export async function visualForEnglish(english: string): Promise<WordVisual> {
  const head = normalizeForMatch(glossHeadword(english));
  const id = head.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "") || "WORD";
  const concept = (await repo.getConcept(id)) ?? (await repo.findConceptByAlias(head));
  // Unknown words that read like actions ("to run") search GIFs; everything else searches stickers.
  const kind = concept?.kind ?? (/^to\s/i.test(english.trim()) ? "gesture" : "item");
  const { visual } = await resolveVisual(
    {
      concept_id: concept?.concept_id ?? id,
      english_gloss: concept?.english_gloss ?? head,
      kind,
      emoji: concept?.emoji ?? null,
      search_terms: concept?.search_terms?.length ? concept.search_terms : [head],
      role: kind === "gesture" ? "gesture" : "item",
    },
    visualDeps(),
  );
  return { english, visual, emoji: concept?.emoji ?? visual?.emoji ?? null };
}
