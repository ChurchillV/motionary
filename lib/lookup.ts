/**
 * Concept resolution (sections 7–9): source text → concept → target text,
 * plus the visual and any cached audio.
 */
import { getCachedAudio } from "./audio";
import { hasGemini, hasGiphy } from "./config";
import { repo, type ConceptRow, type TranslationRow } from "./db";
import { fallbackRender, fallbackResolve, fallbackResolveById, fallbackWords } from "./demo-fallback";
import { embed, translate } from "./gemini";
import { searchGiphy } from "./giphy";
import { getLanguage, ttsProviderFor, type Language } from "./languages";
import type { LookupResponse, RenderResult, ResolveResult, Visual } from "./schemas";
import { cleanInput, glossHeadword, MAX_INPUT_CHARS, minConfidence, normalizeForMatch } from "./text";
import { ModelError } from "./validated";
import { resolveVisual, type VisualDeps, type VisualNeed } from "./visuals";

export class LookupError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "LookupError";
  }
}

export type LookupInput = { text: string; source_lang: string; target_lang: string; concept_id?: string };

/** What the resolve step stores in input_cache.candidates. */
type CachedResolve = Omit<ResolveResult, "concept_id" | "english_gloss" | "kind" | "emoji">;

const log = (msg: string) => console.warn(`[lookup] ${msg}`);

function requireLanguage(code: string): Language {
  const lang = getLanguage(code);
  if (!lang) throw new LookupError(400, `Unsupported language: ${code}`);
  return lang;
}

function noKeyMessage(lang: string) {
  const words = fallbackWords(lang);
  return words.length
    ? `Translation is offline right now. Try a demo word: ${words.slice(0, 6).join(", ")}.`
    : "Translation is offline right now. Please try again in a moment.";
}

// ---------- 8a. Resolve ----------

async function conceptIdsForPrompt(text: string): Promise<string[]> {
  const all = await repo.listConcepts();
  if (all.length <= 150 || !hasGemini()) return all.map((c) => c.concept_id);
  try {
    if ((await repo.countEmbedded()) > 0) {
      const matches = await repo.matchConcepts(await embed(text), 30, 0);
      if (matches.length) return matches.map((m) => m.concept_id);
    }
  } catch (e) {
    log(`embedding shortlist skipped: ${(e as Error).message}`);
  }
  return all.map((c) => c.concept_id);
}

async function storeResolved(r: ResolveResult) {
  await repo.insertConceptsIfMissing([
    {
      concept_id: r.concept_id, english_gloss: r.english_gloss, kind: r.kind, emoji: r.emoji,
      aliases: [], search_terms: r.gif_search_terms,
    },
  ]);
  if (r.item_concept_id) {
    const words = r.item_concept_id.toLowerCase().replace(/_/g, " ");
    await repo.insertConceptsIfMissing([
      { concept_id: r.item_concept_id, english_gloss: words, kind: "item", emoji: null, aliases: [], search_terms: [words] },
    ]);
  }
}

async function resolveSource(text: string, src: Language): Promise<ResolveResult & { cached: boolean }> {
  const norm = normalizeForMatch(text);

  const cached = await repo.getInputCache(src.code, norm);
  if (cached) {
    const concept = await repo.getConcept(cached.concept_id);
    if (concept) {
      const meta = (cached.candidates ?? {}) as Partial<CachedResolve>;
      return {
        concept_id: concept.concept_id, english_gloss: concept.english_gloss, kind: concept.kind, emoji: concept.emoji,
        gesture_id: meta.gesture_id ?? (concept.kind === "gesture" ? concept.concept_id : null),
        item_concept_id: meta.item_concept_id ?? null,
        gif_search_terms: concept.search_terms?.length ? concept.search_terms : meta.gif_search_terms ?? [],
        matched_form: meta.matched_form ?? null,
        alternatives: meta.alternatives ?? [],
        source: meta.source ?? "model",
        confidence: meta.confidence ?? "medium",
        cached: true,
      };
    }
  }

  let result: ResolveResult | null = null;
  if (hasGemini()) {
    const lexiconMatches =
      src.code !== "eng" && (await repo.hasLexicon(src.code)) ? await repo.lexiconLookup(src.code, norm) : [];
    try {
      result = await translate.resolve({
        text,
        lang: src,
        lexiconMatches,
        conceptIds: await conceptIdsForPrompt(text),
      });
      if (result.source === "lexicon" && !lexiconMatches.length) result = { ...result, source: "model", matched_form: null };
    } catch (e) {
      if (!(e instanceof ModelError)) throw e;
      log(`resolve failed: ${e.attempts.join(" | ")}`);
    }
  }
  result ??= fallbackResolve(src.code, norm);
  if (!result) {
    throw hasGemini()
      ? new LookupError(502, "We couldn't understand that word just now. Please try again.")
      : new LookupError(503, noKeyMessage(src.code));
  }

  await storeResolved(result);
  const meta: CachedResolve = {
    gesture_id: result.gesture_id, item_concept_id: result.item_concept_id, gif_search_terms: result.gif_search_terms,
    matched_form: result.matched_form, alternatives: result.alternatives, source: result.source, confidence: result.confidence,
  };
  await repo.setInputCache({ lang_code: src.code, text_normalized: norm, concept_id: result.concept_id, candidates: meta });
  return { ...result, cached: false };
}

/** The learner tapped a "did you mean" chip: build a resolve result for that concept. */
async function resolveChosen(conceptId: string, text: string, src: Language): Promise<ResolveResult> {
  let concept = await repo.getConcept(conceptId);
  if (!concept) {
    // Alternatives are not stored as concepts until chosen. Find the gloss from the cached candidates.
    const cached = await repo.getInputCache(src.code, normalizeForMatch(text));
    const alts = ((cached?.candidates ?? {}) as Partial<CachedResolve>).alternatives ?? [];
    const alt = alts.find((a) => a.concept_id === conceptId);
    const fb = fallbackResolve("eng", normalizeForMatch(alt?.english_gloss ?? ""));
    let guess: ResolveResult | null = fb?.concept_id === conceptId ? fb : null;
    if (!guess && alt && hasGemini()) {
      try {
        guess = await translate.resolve({ text: alt.english_gloss, lang: requireLanguage("eng"), lexiconMatches: [], conceptIds: [conceptId] });
      } catch {}
    }
    concept = {
      concept_id: conceptId,
      english_gloss: alt?.english_gloss ?? guess?.english_gloss ?? conceptId.toLowerCase().replace(/_/g, " "),
      kind: guess?.kind ?? "item",
      emoji: guess?.emoji ?? null,
      aliases: [],
      search_terms: guess?.gif_search_terms ?? [],
    };
    await repo.insertConceptsIfMissing([concept]);
  }
  return {
    concept_id: concept.concept_id, english_gloss: concept.english_gloss, kind: concept.kind, emoji: concept.emoji,
    gesture_id: concept.kind === "gesture" ? concept.concept_id : null, item_concept_id: null,
    gif_search_terms: concept.search_terms ?? [], matched_form: null, alternatives: [],
    source: "model", confidence: "high",
  };
}

// ---------- 8b. Render ----------

function rowToRender(t: TranslationRow): RenderResult {
  return {
    target: { form: t.form, romanization: t.romanization, ipa: t.ipa },
    example_sentence: t.example_target ? { target: t.example_target, english: t.example_en ?? "" } : { target: "", english: "" },
    source: t.source,
    confidence: t.confidence,
  };
}

async function renderTarget(concept: Pick<ConceptRow, "concept_id" | "english_gloss" | "kind">, tgt: Language): Promise<RenderResult> {
  const cached = await repo.getTranslation(concept.concept_id, tgt.code);
  if (cached) return rowToRender(cached);

  let result: RenderResult | null = null;
  if (hasGemini()) {
    const lexiconEntries = (await repo.hasLexicon(tgt.code))
      ? await repo.lexiconByEnglish(tgt.code, glossHeadword(concept.english_gloss))
      : [];
    try {
      result = await translate.render({ concept, lang: tgt, lexiconEntries });
      if (result.source === "lexicon" && !lexiconEntries.length) result = { ...result, source: "model" };
    } catch (e) {
      if (!(e instanceof ModelError)) throw e;
      log(`render failed: ${e.attempts.join(" | ")}`);
    }
  }
  result ??= fallbackRender(concept.concept_id, tgt.code);
  if (!result && tgt.code === "eng") {
    // English comes from the concept itself; no example without the model.
    return {
      target: { form: glossHeadword(concept.english_gloss), romanization: null, ipa: null },
      example_sentence: { target: "", english: "" },
      source: "model",
      confidence: "medium",
    };
  }
  if (!result) {
    throw hasGemini()
      ? new LookupError(502, "We couldn't translate that just now. Please try again.")
      : new LookupError(503, `Translation into ${tgt.name} is offline right now.`);
  }

  await repo.upsertTranslation({
    concept_id: concept.concept_id, lang_code: tgt.code, form: result.target.form,
    romanization: result.target.romanization, ipa: result.target.ipa,
    example_target: result.example_sentence.target || null, example_en: result.example_sentence.english || null,
    source: result.source, confidence: result.confidence, verified: false,
  });
  return result;
}

// ---------- 9. Visuals ----------

export function visualDeps(): VisualDeps {
  return {
    getConcept: (id) => repo.getConcept(id),
    findByAlias: (t) => repo.findConceptByAlias(t),
    approvedGifs: (id) => repo.approvedGifsFor(id),
    embed: hasGemini() ? embed : null,
    matchConcepts: (v, n, min) => repo.matchConcepts(v, n, min),
    searchGiphy: hasGiphy() ? (endpoint, q) => searchGiphy(endpoint, q, 10) : null,
    queueCuration: (id, reason) => repo.queueCuration(id, reason),
    log,
  };
}

async function needFor(
  deps: VisualDeps,
  conceptId: string,
  role: Visual["role"],
  fallback?: Partial<VisualNeed>,
): Promise<VisualNeed> {
  const c = await deps.getConcept(conceptId);
  return {
    concept_id: conceptId,
    english_gloss: c?.english_gloss ?? fallback?.english_gloss ?? conceptId.toLowerCase().replace(/_/g, " "),
    kind: c?.kind ?? fallback?.kind ?? "item",
    emoji: c?.emoji ?? fallback?.emoji ?? null,
    search_terms: c?.search_terms?.length ? c.search_terms : fallback?.search_terms ?? [],
    role,
    alsoTry: fallback?.alsoTry,
  };
}

async function visualsFor(r: ResolveResult, deps: VisualDeps): Promise<Visual[]> {
  if (r.gesture_id && r.item_concept_id) {
    const [g, i] = await Promise.all([
      needFor(deps, r.gesture_id, "gesture").then((n) => resolveVisual(n, deps)),
      needFor(deps, r.item_concept_id, "item", { emoji: r.emoji }).then((n) => resolveVisual(n, deps)),
    ]);
    return [g.visual, i.visual].filter((v): v is Visual => !!v);
  }
  const role: Visual["role"] = r.kind === "gesture" ? "gesture" : "item";
  const alsoTry = r.gesture_id && r.gesture_id !== r.concept_id ? [r.gesture_id] : undefined;
  const need = await needFor(deps, r.concept_id, role, {
    english_gloss: r.english_gloss, kind: r.kind, emoji: r.emoji, search_terms: r.gif_search_terms, alsoTry,
  });
  const { visual } = await resolveVisual(need, deps);
  return visual ? [visual] : [];
}

// ---------- Main ----------

export function validateInput(input: LookupInput) {
  const text = cleanInput(input.text ?? "");
  if (!text) throw new LookupError(400, "Type a word first.");
  if (text.length > MAX_INPUT_CHARS) throw new LookupError(400, `Keep it short: ${MAX_INPUT_CHARS} characters at most.`);
  const src = requireLanguage(input.source_lang);
  const tgt = requireLanguage(input.target_lang);
  if (src.code === tgt.code) throw new LookupError(400, "Pick two different languages.");
  return { text, src, tgt };
}

export async function lookup(input: LookupInput): Promise<LookupResponse> {
  const { text, src, tgt } = validateInput(input);

  const resolved = input.concept_id ? await resolveChosen(input.concept_id, text, src) : await resolveSource(text, src);
  const deps = visualDeps();
  const [render, visuals] = await Promise.all([renderTarget(resolved, tgt), visualsFor(resolved, deps)]);

  const example = render.example_sentence.target ? render.example_sentence : null;
  const ttsCovered = ttsProviderFor(tgt.code) !== "none";
  const [wordAudio, sentenceAudio] = ttsCovered
    ? await Promise.all([
        getCachedAudio(resolved.concept_id, tgt.code, "word", render.target.form),
        getCachedAudio(resolved.concept_id, tgt.code, "sentence", example?.target ?? null),
      ])
    : [null, null];

  const altEmoji = await Promise.all(resolved.alternatives.map((a) => repo.getConcept(a.concept_id)));
  const attribution = [...new Set(visuals.map((v) => v.provider).filter((p) => p === "giphy" || p === "noto"))];

  return {
    concept_id: resolved.concept_id,
    source: { lang: src.code, text, matched_form: resolved.matched_form },
    target_lang: tgt.code,
    alternatives: resolved.alternatives.map((a, i) => ({ ...a, emoji: altEmoji[i]?.emoji ?? null })),
    english_gloss: resolved.english_gloss,
    kind: resolved.kind,
    target: render.target,
    example,
    confidence: minConfidence(resolved.confidence, render.confidence),
    translation_source: resolved.source === "lexicon" || render.source === "lexicon" ? "lexicon" : "model",
    visuals,
    emoji: resolved.emoji,
    // Without a Gemini key only pre-generated clips can play.
    audio: { available: ttsCovered && (hasGemini() || !!wordAudio), word: wordAudio, sentence: sentenceAudio },
    attribution,
  };
}

/**
 * Last resort when the database or an API is down: answer from
 * data/demo-fallback.json with Noto/emoji visuals and no database calls.
 */
export async function lookupFromFallback(input: LookupInput): Promise<LookupResponse | null> {
  const { text, src, tgt } = validateInput(input);
  const resolved = input.concept_id ? fallbackResolveById(input.concept_id) : fallbackResolve(src.code, normalizeForMatch(text));
  if (!resolved) return null;
  const render = fallbackRender(resolved.concept_id, tgt.code);
  if (!render) return null;

  const offlineDeps: VisualDeps = {
    getConcept: async () => null, findByAlias: async () => null, approvedGifs: async () => [],
    embed: null, matchConcepts: async () => [], searchGiphy: null, queueCuration: async () => {},
  };
  const visuals = await visualsFor(resolved, offlineDeps);
  return {
    concept_id: resolved.concept_id,
    source: { lang: src.code, text, matched_form: null },
    target_lang: tgt.code,
    alternatives: resolved.alternatives,
    english_gloss: resolved.english_gloss,
    kind: resolved.kind,
    target: render.target,
    example: render.example_sentence.target ? render.example_sentence : null,
    confidence: minConfidence(resolved.confidence, render.confidence),
    translation_source: "model",
    visuals,
    emoji: resolved.emoji,
    audio: { available: false, word: null, sentence: null },
    attribution: [...new Set(visuals.map((v) => v.provider).filter((p) => p === "noto"))],
    offline: true,
  };
}
