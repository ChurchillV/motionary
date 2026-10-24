/**
 * The one GIPHY client. Every call is cached (7 days) and rate-limited to
 * GIPHY_CALLS_PER_HOUR (beta keys allow 100/hour). Media is never re-hosted:
 * we keep GIPHY ids and URLs only.
 */
import { config, hasGiphy } from "./config";
import { repo } from "./db";
import { SlidingWindowLimiter } from "./ratelimit";

export type GiphyEndpoint = "gifs" | "stickers";

export type GiphyItem = {
  id: string;
  title: string;
  mp4: string | null;
  webp: string | null;
  gif: string | null;
  width: number;
  height: number;
  /** Small MP4 rendition, used for vision screening. */
  smallMp4: string | null;
};

export class GiphyRateLimitError extends Error {
  constructor(readonly retryAfterMs: number, readonly fromServer: boolean) {
    super(fromServer ? "GIPHY returned 429 (rate limited)" : "Local GIPHY budget spent for this hour");
    this.name = "GiphyRateLimitError";
  }
}

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const giphyLimiter = new SlidingWindowLimiter(config.giphyCallsPerHour, 60 * 60 * 1000);

type Rendition = { url?: string; mp4?: string; webp?: string; width?: string; height?: string };
type RawGif = { id: string; title?: string; images?: Record<string, Rendition | undefined> };

export function toItem(raw: RawGif): GiphyItem {
  const fh = raw.images?.fixed_height ?? {};
  const small = raw.images?.fixed_height_small ?? raw.images?.preview ?? {};
  return {
    id: raw.id,
    title: raw.title ?? "",
    mp4: fh.mp4 ?? null,
    webp: fh.webp ?? null,
    gif: fh.url ?? null,
    width: Number(fh.width ?? 0),
    height: Number(fh.height ?? 0),
    smallMp4: small.mp4 ?? fh.mp4 ?? null,
  };
}

export function cacheKey(endpoint: GiphyEndpoint, q: string, limit: number): string {
  return `${endpoint}/search?q=${q.toLowerCase().trim()}&limit=${limit}&rating=g&lang=en`;
}

/**
 * Search GIPHY (rating=g). Cached responses are used for 7 days.
 * Throws GiphyRateLimitError when the budget is spent or GIPHY says 429.
 */
export async function searchGiphy(
  endpoint: GiphyEndpoint,
  q: string,
  limit = 10,
): Promise<GiphyItem[]> {
  const key = cacheKey(endpoint, q, limit);
  const cached = await repo.getGiphyCache(key);
  if (cached && Date.now() - new Date(cached.fetched_at).getTime() < CACHE_TTL_MS) {
    return ((cached.response as { data?: RawGif[] }).data ?? []).map(toItem);
  }
  if (!hasGiphy()) return [];
  if (!giphyLimiter.tryAcquire()) {
    throw new GiphyRateLimitError(giphyLimiter.msUntilAvailable(), false);
  }

  const url = new URL(`https://api.giphy.com/v1/${endpoint}/search`);
  url.search = new URLSearchParams({
    api_key: config.giphyKey,
    q,
    limit: String(limit),
    rating: "g",
    lang: "en",
  }).toString();

  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (res.status === 429) throw new GiphyRateLimitError(60 * 60 * 1000, true);
  if (!res.ok) throw new Error(`GIPHY ${endpoint} search failed: ${res.status}`);
  const body = (await res.json()) as { data?: RawGif[] };
  // Keep only what we need, so the cache stays small.
  const slim = { data: (body.data ?? []).map((g) => ({ id: g.id, title: g.title, images: pick(g.images) })) };
  await repo.setGiphyCache(key, slim);
  return slim.data.map(toItem);
}

function pick(images: RawGif["images"]) {
  const keep = ["fixed_height", "fixed_height_small", "preview"];
  return Object.fromEntries(Object.entries(images ?? {}).filter(([k]) => keep.includes(k)));
}

const CAPTION_WORDS =
  /\b(text|caption|quote|words?|lettering|meme|says?|saying|typography|happy birthday|good morning|good night|monday|friday|lol|omg|wtf)\b/i;

/** True if the title hints at captions, so the GIF would show text. */
export function looksCaptioned(title: string): boolean {
  return CAPTION_WORDS.test(title);
}
