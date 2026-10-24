import type { Language } from "./languages";

export type LexiconMatch = { english: string; form: string; notes?: string | null };

export function resolvePrompt(input: {
  text: string;
  lang: Language;
  lexiconMatches: LexiconMatch[];
  conceptIds: string[];
  gestureIds: string[];
}): string {
  const { text, lang, lexiconMatches, conceptIds, gestureIds } = input;
  const lexicon = lexiconMatches.length
    ? lexiconMatches.map((m) => `- "${m.form}" = ${m.english}${m.notes ? ` (${m.notes})` : ""}`).join("\n")
    : "(none)";

  return `You map a word or short phrase typed by a language learner to a language-independent CONCEPT.

Input text: "${text}"
Input language: ${lang.name} (ISO 639-3: ${lang.code})

Word list matches for this input (from a dictionary, may be empty):
${lexicon}

Existing concept IDs (reuse one when it fits):
${conceptIds.join(", ") || "(none)"}

Allowed gesture IDs:
${gestureIds.join(", ")}

Rules:
1. Reply with JSON only. No prose, no code fences.
2. Reuse an existing concept_id when one fits the most likely meaning. Only coin a new one if nothing fits.
3. concept_id is an UPPERCASE English identifier for ONE sense, using A-Z, 0-9 and _ only (e.g. RUN, not RUN_A_BUSINESS unless that sense is meant).
4. If the input could mean several things, put the most likely sense in concept_id and up to 3 other senses in alternatives (each with its own concept_id and english_gloss). Otherwise alternatives is [].
5. english_gloss is a short English meaning, with a disambiguating note in parentheses when useful, e.g. "bat (flying animal)".
6. kind: "gesture" for actions or feelings you can act out with the body, "item" for things you can show or point at, "other" for anything else (greetings, abstract words).
7. gesture_id must be one of the allowed gesture IDs or null. For greetings like "hello" use the gesture that acts it out (WAVE).
8. For an action + object phrase such as "eat apple", concept_id is the whole phrase (EAT_APPLE), gesture_id is the action (EAT) and item_concept_id is the object's concept id (APPLE). Otherwise item_concept_id is null.
9. emoji: one emoji that shows the concept, or null.
10. gif_search_terms: 1 to 3 short English search terms that would find a looping GIF of this concept with no text in it.
11. If dictionary matches are given, prefer meanings they support, set matched_form to the matched form and source to "lexicon". Otherwise matched_form is null and source is "model".
12. If you do not recognise the input, still give your best guess with confidence "low". Never invent a dictionary match.

JSON shape:
{"concept_id": "WAVE", "english_gloss": "wave (greet with a raised hand)", "kind": "gesture", "gesture_id": "WAVE", "item_concept_id": null, "emoji": "👋", "gif_search_terms": ["waving hello"], "matched_form": null, "alternatives": [{"concept_id": "WAVE_WATER", "english_gloss": "wave (of the sea)"}], "source": "model", "confidence": "high"}`;
}

export function renderPrompt(input: {
  concept: { concept_id: string; english_gloss: string; kind: string };
  lang: Language;
  lexiconEntries: LexiconMatch[];
}): string {
  const { concept, lang, lexiconEntries } = input;
  const lexicon = lexiconEntries.length
    ? lexiconEntries.map((m) => `- ${m.english} = "${m.form}"${m.notes ? ` (${m.notes})` : ""}`).join("\n")
    : "(none)";
  const isEnglish = lang.code === "eng";
  const romanRule = lang.romanization
    ? `romanization: the form written in ${lang.romanization}.`
    : "romanization: null (the language uses Latin script).";

  return `You teach beginners a word in ${lang.name} (ISO 639-3: ${lang.code}).

Concept: ${concept.concept_id}
Meaning: ${concept.english_gloss}
Kind: ${concept.kind}

Dictionary entries for ${lang.name} (may be empty):
${lexicon}

Rules:
1. Reply with JSON only. No prose, no code fences.
2. target.form: the most common, natural ${lang.name} word or short phrase for this meaning, in its usual dictionary form${lang.script === "Latn" ? "" : ", in native script"}. Prefer forms from the dictionary entries and then set source to "lexicon"; otherwise source is "model". Never claim a dictionary match that is not listed.
3. ${isEnglish ? "romanization: null." : romanRule}
4. ipa: the IPA pronunciation without slashes or brackets, or null if unsure.
5. example_sentence.target: a very short, simple ${lang.name} sentence (3 to 7 words) that a beginner can understand, using target.form exactly as written. example_sentence.english: its English meaning.
6. confidence: "high" if you are sure, "medium" if fairly sure, "low" if unsure (still answer).

JSON shape:
{"target": {"form": "...", "romanization": ${lang.romanization ? '"..."' : "null"}, "ipa": "..."}, "example_sentence": {"target": "...", "english": "..."}, "source": "model", "confidence": "high"}`;
}

export function enrichPrompt(concepts: { concept_id: string; english_gloss: string; kind: string }[]): string {
  return `For each concept below, give:
- emoji: one emoji that shows it (or null)
- aliases: 0 to 5 common English synonyms or inflections, lowercase
- search_terms: 2 or 3 short English GIPHY search terms that would find a looping GIF ${"(gestures: a person or character acting it out; items: a sticker of the object)"} with no text in it

Reply with JSON only: {"concepts": [{"concept_id": "...", "emoji": "...", "aliases": ["..."], "search_terms": ["..."]}]}

Concepts:
${concepts.map((c) => `- ${c.concept_id} | ${c.english_gloss} | ${c.kind}`).join("\n")}`;
}

export function screenPrompt(gloss: string, kind: string): string {
  return `This looping animation is a candidate to teach the ${kind === "gesture" ? "action" : "word"} "${gloss}" to language learners without words.

Judge it and reply with JSON only:
{"matches": true|false, "score": 1-5, "has_text": true|false, "real_celebrity": true|false, "notes": "short reason"}

- matches: does it clearly show "${gloss}"?
- score: 5 = instantly obvious and friendly, 1 = unrelated or confusing.
- has_text: any captions, words or letters visible?
- real_celebrity: does it show a recognisable real celebrity or public figure?`;
}
