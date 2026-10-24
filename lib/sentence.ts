/** Sentence mode: translate a whole sentence directly (no concept), cached per language pair. */
import { hasGemini } from "./config";
import { repo } from "./db";
import { translate } from "./gemini";
import { getLanguage } from "./languages";
import { LookupError } from "./lookup";
import { SentenceResult, type SentenceResponse } from "./schemas";
import { cleanInput, MAX_SENTENCE_CHARS, normalizeForMatch } from "./text";
import { ModelError } from "./validated";

/** Key in input_cache. ">" can never survive normalisation, so it can't collide with a word. */
export const sentenceCacheKey = (targetLang: string, text: string) => `s>${targetLang}:${normalizeForMatch(text)}`;

export async function translateSentence(input: { text: string; source_lang: string; target_lang: string }): Promise<SentenceResponse> {
  const text = cleanInput(input.text ?? "");
  if (!text) throw new LookupError(400, "Type a sentence first.");
  if (text.length > MAX_SENTENCE_CHARS) throw new LookupError(400, `Keep it under ${MAX_SENTENCE_CHARS} characters.`);
  const from = getLanguage(input.source_lang);
  const to = getLanguage(input.target_lang);
  if (!from || !to) throw new LookupError(400, "Unsupported language.");
  if (from.code === to.code) throw new LookupError(400, "Pick two different languages.");

  const key = sentenceCacheKey(to.code, text);
  const cached = await repo.getInputCache(from.code, key);
  const hit = SentenceResult.safeParse(cached?.candidates);
  if (hit.success) return { ...hit.data, source: { lang: from.code, text }, target_lang: to.code };

  if (!hasGemini()) throw new LookupError(503, "Sentence translation is offline right now. Try a single word.");
  let result: SentenceResult;
  try {
    result = await translate.sentence({ text, from, to });
  } catch (e) {
    if (e instanceof ModelError) {
      console.warn(`[sentence] failed: ${e.attempts.join(" | ")}`);
      throw new LookupError(502, "We couldn't translate that sentence just now. Please try again.");
    }
    throw e;
  }
  await repo.setInputCache({ lang_code: from.code, text_normalized: key, concept_id: null, candidates: result });
  return { ...result, source: { lang: from.code, text }, target_lang: to.code };
}
