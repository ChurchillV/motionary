import { describe, expect, it } from "vitest";
import { SentenceResult } from "@/lib/schemas";
import { isSentence } from "@/lib/sentence-detect";
import { sentenceCacheKey } from "@/lib/sentence";
import { normalizeForMatch } from "@/lib/text";

describe("sentence detection", () => {
  it("keeps words and short phrases in word mode", () => {
    expect(isSentence("water")).toBe(false);
    expect(isSentence("eat apple")).toBe(false);
    expect(isSentence("水", true)).toBe(false);
    expect(isSentence("食べる", true)).toBe(false);
  });

  it("switches to sentence mode for 3+ words, end punctuation or long input", () => {
    expect(isSentence("I drink water")).toBe(true);
    expect(isSentence("Hola!")).toBe(true);
    expect(isSentence("¿Dónde está?")).toBe(true);
    expect(isSentence("x".repeat(41))).toBe(true);
    expect(isSentence("水を飲みます。", true)).toBe(true);
    expect(isSentence("私は水を飲みます", true)).toBe(true);
  });
});

describe("sentence cache", () => {
  it("uses a key that can never collide with a normalised word", () => {
    const key = sentenceCacheKey("spa", "I drink water.");
    expect(key).toBe("s>spa:i drink water");
    expect(normalizeForMatch(key)).not.toBe(key); // ">" is stripped from any word input
  });

  it("validates the model's sentence JSON", () => {
    const ok = { translation: "Bebo agua.", romanization: null, english: "I drink water.", key_words: [{ source: "drink", target: "beber", english: "drink" }], confidence: "high" };
    expect(SentenceResult.safeParse(ok).success).toBe(true);
    expect(SentenceResult.safeParse({ ...ok, translation: "" }).success).toBe(false);
    expect(SentenceResult.safeParse({ ...ok, key_words: Array(6).fill(ok.key_words[0]) }).success).toBe(false);
  });
});
