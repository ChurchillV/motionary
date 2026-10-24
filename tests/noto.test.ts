import { describe, expect, it } from "vitest";
import { emojiToCodepoint, notoAnimatedCodepoint, notoUrls } from "@/lib/noto";

describe("emoji to codepoint", () => {
  it("converts single and multi-codepoint emoji", () => {
    expect(emojiToCodepoint("👋")).toBe("1f44b");
    expect(emojiToCodepoint("☀️")).toBe("2600_fe0f");
    expect(emojiToCodepoint("🧑‍🍳")).toBe("1f9d1_200d_1f373");
  });

  it("finds the Noto animated codepoint with or without FE0F", () => {
    const set = new Set(["1f44b", "2764_fe0f", "263a_fe0f"]);
    expect(notoAnimatedCodepoint("👋", set)).toBe("1f44b");
    expect(notoAnimatedCodepoint("❤️", set)).toBe("2764_fe0f");
    expect(notoAnimatedCodepoint("❤", set)).toBe("2764_fe0f");
    expect(notoAnimatedCodepoint("☀️", set)).toBeNull();
    expect(notoAnimatedCodepoint(null, set)).toBeNull();
  });

  it("uses the cached list from data/noto-animated.json", () => {
    expect(notoAnimatedCodepoint("🍎")).toBe("1f34e");
    expect(notoUrls("1f34e").webp).toBe("https://fonts.gstatic.com/s/e/notoemoji/latest/1f34e/512.webp");
  });
});
