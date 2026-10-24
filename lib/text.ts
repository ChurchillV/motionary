import { createHash } from "node:crypto";

export const MAX_INPUT_CHARS = 40;

export type Confidence = "low" | "medium" | "high";

/**
 * Normalise text for matching: lowercase, strip Latin-style diacritics
 * (é → e, ñ → n), drop punctuation, collapse spaces.
 * Only combining marks in U+0300–U+036F are removed, so Japanese dakuten
 * (が) and Korean syllables survive the round trip through NFD/NFC.
 */
export function normalizeForMatch(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .normalize("NFC")
    .replace(/[\p{P}\p{S}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Light clean-up of what the user typed (kept for display and prompts). */
export function cleanInput(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

const CONFIDENCE_ORDER: Confidence[] = ["low", "medium", "high"];

/** Overall confidence is the lower of the two. */
export function minConfidence(a: Confidence, b: Confidence): Confidence {
  return CONFIDENCE_ORDER[Math.min(CONFIDENCE_ORDER.indexOf(a), CONFIDENCE_ORDER.indexOf(b))];
}

/** Remove ```json fences and any chatter around the first JSON object. */
export function stripFences(raw: string): string {
  let s = raw.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start !== -1 && end > start) s = s.slice(start, end + 1);
  return s;
}

/** sha256 of the exact text spoken. Any change in the text means a new clip. */
export function textHash(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** "wave (greet with a raised hand)" → "wave"; "to eat" → "eat". */
export function glossHeadword(gloss: string): string {
  return gloss.replace(/\s*\(.*?\)\s*/g, " ").trim().replace(/^to\s+/i, "");
}
