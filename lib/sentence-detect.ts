/** Client-safe: decide whether the input should go to sentence mode. */
const SENTENCE_END = /[.?!。？！…]\s*$/u;

export function isSentence(text: string, ime = false): boolean {
  const t = text.trim();
  if (!t) return false;
  if (SENTENCE_END.test(t)) return true;
  if (t.length > 40) return true;
  // Scripts typed with an input method usually have no spaces between words.
  if (ime) return [...t].length >= 7;
  return t.split(/\s+/).length >= 3;
}
