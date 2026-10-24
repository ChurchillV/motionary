/**
 * Noto Animated Emoji (CC BY 4.0). Files may be self-hosted, unlike GIPHY.
 * The list of animated codepoints is cached in data/noto-animated.json.
 */
import notoList from "@/data/noto-animated.json";

const NOTO_BASE = "https://fonts.gstatic.com/s/e/notoemoji/latest";
const animated = new Set<string>(notoList.codepoints);

/** "👋" → "1f44b"; "☀️" → "2600_fe0f"; "🧑‍🍳" → "1f9d1_200d_1f373". */
export function emojiToCodepoint(emoji: string): string {
  return Array.from(emoji)
    .map((ch) => ch.codePointAt(0)!.toString(16).toLowerCase())
    .join("_");
}

/**
 * The codepoint Noto uses for this emoji's animation, or null if there is none.
 * Noto's list sometimes drops or keeps the FE0F variation selector, so try both.
 */
export function notoAnimatedCodepoint(emoji: string | null | undefined, set: Set<string> = animated): string | null {
  if (!emoji) return null;
  const cp = emojiToCodepoint(emoji);
  const withoutFe0f = cp.split("_").filter((p) => p !== "fe0f").join("_");
  const withFe0f = cp.includes("fe0f") ? cp : `${cp}_fe0f`;
  for (const candidate of [cp, withoutFe0f, withFe0f]) if (set.has(candidate)) return candidate;
  return null;
}

export function notoUrls(codepoint: string) {
  return {
    webp: `${NOTO_BASE}/${codepoint}/512.webp`,
    gif: `${NOTO_BASE}/${codepoint}/512.gif`,
    lottie: `${NOTO_BASE}/${codepoint}/lottie.json`,
  };
}
