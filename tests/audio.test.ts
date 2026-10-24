import { describe, expect, it } from "vitest";
import { clipHash, isClipFresh, storagePathFor } from "@/lib/audio";
import { pcmToWav } from "@/lib/gemini";
import { ttsProviderFor } from "@/lib/languages";
import { textHash } from "@/lib/text";

describe("TTS provider routing", () => {
  it("routes listed languages to gemini and everything else to none", () => {
    expect(ttsProviderFor("spa")).toBe("gemini");
    expect(ttsProviderFor("jpn")).toBe("gemini");
    expect(ttsProviderFor("que")).toBe("none");
    expect(ttsProviderFor("xyz", { xyz: "none" })).toBe("none");
    expect(ttsProviderFor("abc", { abc: "browser" })).toBe("none");
  });
});

describe("text_hash cache invalidation", () => {
  it("reuses a clip only when the spoken text is identical", () => {
    const row = { text_hash: clipHash("Bebo agua fría.") };
    expect(isClipFresh(row, "Bebo agua fría.")).toBe(true);
    expect(isClipFresh(row, "Bebo agua.")).toBe(false);
    expect(isClipFresh(null, "Bebo agua.")).toBe(false);
  });

  it("regenerates clips made by an older TTS version", () => {
    expect(isClipFresh({ text_hash: textHash("agua") }, "agua")).toBe(false);
  });

  it("stores clips under audio/<lang>/<concept>/<kind>-<hash>", () => {
    expect(storagePathFor("spa", "WATER", "word", textHash("agua"))).toMatch(/^audio\/spa\/WATER\/word-[0-9a-f]{16}\.wav$/);
  });
});

describe("PCM to WAV", () => {
  it("writes a valid 44-byte header", () => {
    const wav = pcmToWav(Buffer.alloc(48000), 24000);
    expect(wav.subarray(0, 4).toString()).toBe("RIFF");
    expect(wav.subarray(8, 12).toString()).toBe("WAVE");
    expect(wav.readUInt32LE(24)).toBe(24000);
    expect(wav.length).toBe(48044);
  });
});
