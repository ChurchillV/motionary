import { z } from "zod";

const ConceptId = z.string().regex(/^[A-Z][A-Z0-9_]*$/);
const ConfidenceSchema = z.enum(["low", "medium", "high"]);

export const ResolveResult = z.object({
  concept_id: ConceptId,
  english_gloss: z.string(),
  kind: z.enum(["gesture", "item", "other"]),
  gesture_id: z.string().nullable(),
  item_concept_id: z.string().nullable(),
  emoji: z.string().nullable(),
  gif_search_terms: z.array(z.string()).max(3),
  matched_form: z.string().nullable(), // lexicon form the input matched, if any
  alternatives: z
    .array(z.object({ concept_id: ConceptId, english_gloss: z.string() }))
    .max(3),
  source: z.enum(["lexicon", "model"]),
  confidence: ConfidenceSchema,
});
export type ResolveResult = z.infer<typeof ResolveResult>;

export const RenderResult = z.object({
  target: z.object({
    form: z.string().min(1),
    romanization: z.string().nullable(),
    ipa: z.string().nullable(),
  }),
  example_sentence: z.object({ target: z.string(), english: z.string() }),
  source: z.enum(["lexicon", "model"]),
  confidence: ConfidenceSchema,
});
export type RenderResult = z.infer<typeof RenderResult>;

/** Sentence mode: one direct translation plus a few key words to explore. */
export const SentenceResult = z.object({
  translation: z.string().min(1),
  romanization: z.string().nullable(),
  english: z.string(),
  key_words: z
    .array(
      z.object({
        source: z.string().min(1),
        target: z.string().min(1),
        romanization: z.string().nullable().optional(),
        english: z.string(),
      }),
    )
    .max(5),
  confidence: ConfidenceSchema,
});
export type SentenceResult = z.infer<typeof SentenceResult>;

export const SentenceRequest = z
  .object({ text: z.string(), source_lang: z.string(), target_lang: z.string() })
  .refine((r) => r.source_lang !== r.target_lang, { message: "source_lang and target_lang must differ" });

export type SentenceResponse = SentenceResult & { source: { lang: string; text: string }; target_lang: string };

/** Pictures for the sentence word deck (no translation calls). */
export const VisualsRequest = z.object({ words: z.array(z.string().min(1).max(40)).min(1).max(5) });
export type WordVisual = { english: string; visual: Visual | null; emoji: string | null };

/** Batch enrichment (script 02). */
export const EnrichResult = z.object({
  concepts: z.array(
    z.object({
      concept_id: ConceptId,
      emoji: z.string().nullable(),
      aliases: z.array(z.string()).max(5),
      search_terms: z.array(z.string()).min(1).max(3),
    }),
  ),
});

/** Vision screening (script 04). */
export const ScreenResult = z.object({
  matches: z.boolean(),
  score: z.number().int().min(1).max(5),
  has_text: z.boolean(),
  real_celebrity: z.boolean(),
  notes: z.string(),
});
export type ScreenResult = z.infer<typeof ScreenResult>;

/** Request body for POST /api/lookup. */
export const LookupRequest = z
  .object({
    text: z.string(),
    source_lang: z.string(),
    target_lang: z.string(),
    concept_id: ConceptId.optional(),
  })
  .refine((r) => r.source_lang !== r.target_lang, {
    message: "source_lang and target_lang must differ",
  });

export const AudioRequest = z.object({
  concept_id: ConceptId,
  lang: z.string(),
  kind: z.enum(["word", "sentence"]),
});

// ---------- Response types shared with the client ----------

export type Visual = {
  provider: "giphy" | "noto" | "emoji";
  mp4: string | null;
  webp: string | null;
  gif?: string | null;
  emoji?: string | null;
  width: number;
  height: number;
  role: "gesture" | "item";
};

export type AudioClip = { url: string; provider: "gemini"; synthetic: true };

export type LookupResponse = {
  concept_id: string;
  source: { lang: string; text: string; matched_form: string | null };
  target_lang: string;
  alternatives: { concept_id: string; english_gloss: string; emoji?: string | null }[];
  english_gloss: string;
  kind: "gesture" | "item" | "other";
  target: { form: string; romanization: string | null; ipa: string | null };
  example: { target: string; english: string } | null;
  confidence: "low" | "medium" | "high";
  translation_source: "lexicon" | "model";
  visuals: Visual[];
  emoji: string | null;
  audio: {
    available: boolean;
    word: AudioClip | null;
    sentence: AudioClip | null;
  };
  attribution: string[];
  /** True when served from data/demo-fallback.json because an API was down. */
  offline?: boolean;
};
