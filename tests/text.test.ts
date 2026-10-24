import { describe, expect, it } from "vitest";
import { glossHeadword, minConfidence, normalizeForMatch, stripFences, textHash } from "@/lib/text";

describe("text normalisation", () => {
  it("strips Latin diacritics, case and punctuation", () => {
    expect(normalizeForMatch("  Café! ")).toBe("cafe");
    expect(normalizeForMatch("¿Mañana?")).toBe("manana");
    expect(normalizeForMatch("Über   Straße")).toBe("uber straße");
    expect(normalizeForMatch("çà-va")).toBe("ca va");
  });

  it("keeps Japanese dakuten and Korean syllables intact", () => {
    expect(normalizeForMatch("がっこう")).toBe("がっこう");
    expect(normalizeForMatch("먹다")).toBe("먹다");
    expect(normalizeForMatch("水。")).toBe("水");
  });

  it("matches accented and unaccented input", () => {
    expect(normalizeForMatch("cafe")).toBe(normalizeForMatch("café"));
  });
});

describe("confidence merging", () => {
  it("takes the lower of resolve and render", () => {
    expect(minConfidence("high", "high")).toBe("high");
    expect(minConfidence("high", "medium")).toBe("medium");
    expect(minConfidence("low", "high")).toBe("low");
    expect(minConfidence("medium", "low")).toBe("low");
  });
});

describe("helpers", () => {
  it("strips code fences", () => {
    expect(stripFences('```json\n{"a":1}\n```')).toBe('{"a":1}');
    expect(stripFences('Here you go: {"a":1} hope it helps')).toBe('{"a":1}');
  });
  it("takes the headword of a gloss", () => {
    expect(glossHeadword("wave (greet with a raised hand)")).toBe("wave");
    expect(glossHeadword("to eat")).toBe("eat");
  });
  it("text_hash changes when the text changes", () => {
    expect(textHash("agua")).toBe(textHash("agua"));
    expect(textHash("agua")).not.toBe(textHash("agua."));
  });
});
