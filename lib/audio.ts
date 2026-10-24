/**
 * Audio (section 9A). All speech is Gemini TTS and labelled "synthetic voice".
 * Clips are cached in Supabase Storage (or .local-data) and keyed by the
 * sha256 of the exact text spoken, so editing a translation regenerates it.
 */
import { hasGemini } from "./config";
import { repo } from "./db";
import { synthesize } from "./gemini";
import { ttsProviderFor } from "./languages";
import type { AudioClip } from "./schemas";
import { glossHeadword, textHash } from "./text";

export type AudioKind = "word" | "sentence";

const inFlight = new Map<string, Promise<AudioClip | null>>();

function clip(storagePath: string): AudioClip {
  return { url: repo.publicUrl(storagePath), provider: "gemini", synthetic: true };
}

export function storagePathFor(lang: string, conceptId: string, kind: AudioKind, hash: string): string {
  return `audio/${lang}/${conceptId}/${kind}-${hash.slice(0, 16)}.wav`;
}

/** A clip is reusable only when it was made from exactly this text. */
export function isClipFresh(row: { text_hash: string } | null, text: string): boolean {
  return !!row && row.text_hash === textHash(text);
}

/** Cached clip URL, or null. Never generates (used by /api/lookup so it never blocks). */
export async function getCachedAudio(conceptId: string, lang: string, kind: AudioKind, text: string | null) {
  if (!text || ttsProviderFor(lang) === "none") return null;
  const row = await repo.getAudioClip(conceptId, lang, kind);
  return isClipFresh(row, text) ? clip(row!.storage_path) : null;
}

/** Cached clip, or generate → store → return. Returns null on failure; never throws. */
export async function getAudio(conceptId: string, lang: string, kind: AudioKind, text: string): Promise<AudioClip | null> {
  if (ttsProviderFor(lang) === "none" || !text.trim()) return null;
  const key = `${conceptId}:${lang}:${kind}:${textHash(text)}`;
  const pending = inFlight.get(key);
  if (pending) return pending;

  const job = (async () => {
    try {
      const cached = await getCachedAudio(conceptId, lang, kind, text);
      if (cached) return cached;
      if (!hasGemini()) return null;
      const hash = textHash(text);
      const { audio, mimeType, durationMs } = await synthesize(text, lang, kind);
      const storagePath = storagePathFor(lang, conceptId, kind, hash);
      await repo.uploadFile(storagePath, audio, mimeType);
      await repo.upsertAudioClip({
        concept_id: conceptId, lang_code: lang, kind, text_hash: hash, provider: "gemini",
        storage_path: storagePath, duration_ms: durationMs,
      });
      return clip(storagePath);
    } catch (e) {
      console.error(`[audio] ${key} failed:`, (e as Error).message);
      return null;
    } finally {
      inFlight.delete(key);
    }
  })();
  inFlight.set(key, job);
  return job;
}

/** The exact text to speak for a concept in a language, from stored translations. */
export async function textForAudio(conceptId: string, lang: string, kind: AudioKind): Promise<string | null> {
  const t = await repo.getTranslation(conceptId, lang);
  if (t) return kind === "word" ? t.form : t.example_target;
  if (lang === "eng" && kind === "word") {
    const c = await repo.getConcept(conceptId);
    return c ? glossHeadword(c.english_gloss) : null;
  }
  return null;
}
