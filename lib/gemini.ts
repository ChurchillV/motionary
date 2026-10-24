import { GoogleGenAI, ThinkingLevel, type Part } from "@google/genai";
import { config, hasGemini } from "./config";
import { getLanguage, type Language } from "./languages";
import {
  renderPrompt,
  resolvePrompt,
  screenPrompt,
  type LexiconMatch,
} from "./prompts";
import { RenderResult, ResolveResult, ScreenResult } from "./schemas";
import { generateValidated, PATIENT, retryTransient, type ModelCaller } from "./validated";
import gestures from "@/data/gestures.json";

let client: GoogleGenAI | null = null;

export function gemini(): GoogleGenAI {
  if (!hasGemini()) throw new Error("GEMINI_API_KEY is not set");
  client ??= new GoogleGenAI({ apiKey: config.geminiKey });
  return client;
}

async function withTimeout<T>(ms: number, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await Promise.race([
      run(ctrl.signal),
      new Promise<never>((_, reject) =>
        ctrl.signal.addEventListener("abort", () => reject(new Error(`Timed out after ${ms} ms`))),
      ),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** Text of the answer, skipping any "thought" parts. */
function answerText(parts: Part[] | undefined): string {
  return (parts ?? [])
    .filter((p) => !p.thought && typeof p.text === "string")
    .map((p) => p.text)
    .join("");
}

/** Plain text call used by every JSON helper. Gemma does not get schema-enforced output. */
export const callModel: ModelCaller = (model, prompt) =>
  withTimeout(config.modelTimeoutMs, async (abortSignal) => {
    const res = await gemini().models.generateContent({
      model,
      contents: prompt,
      config: {
        temperature: 0.2,
        abortSignal,
        // Gemma 4 thinks at length by default (~17 s per call); minimal thinking answers in ~2 s.
        ...(model.startsWith("gemma") ? { thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL } } : {}),
      },
    });
    const text = answerText(res.candidates?.[0]?.content?.parts);
    if (!text) throw new Error("Empty model response");
    return text;
  });

const gemmaModels = () => ({ primary: config.gemmaModel, fallback: config.gemmaFallbackModel });

export const translate = {
  /** 8a: source text → concept. */
  async resolve(args: {
    text: string;
    lang: Language;
    lexiconMatches: LexiconMatch[];
    conceptIds: string[];
  }): Promise<ResolveResult> {
    const prompt = resolvePrompt({ ...args, gestureIds: gestures.gestures });
    const { value } = await generateValidated(callModel, prompt, ResolveResult, gemmaModels());
    const allowed = new Set(gestures.gestures);
    return {
      ...value,
      gesture_id: value.gesture_id && allowed.has(value.gesture_id) ? value.gesture_id : null,
      item_concept_id: value.item_concept_id?.toUpperCase() || null,
      alternatives: value.alternatives.filter((a) => a.concept_id !== value.concept_id),
    };
  },

  /** 8b: concept → target language. */
  async render(args: {
    concept: { concept_id: string; english_gloss: string; kind: string };
    lang: Language;
    lexiconEntries: LexiconMatch[];
  }): Promise<RenderResult> {
    const { value } = await generateValidated(callModel, renderPrompt(args), RenderResult, gemmaModels());
    // Strip slashes or brackets the model sometimes adds around IPA.
    const ipa = value.target.ipa?.replace(/^[/[]|[/\]]$/g, "").trim() || null;
    return { ...value, target: { ...value.target, ipa } };
  },
};

/** L2-normalise (Gemini only normalises the full-size vector). */
function normalise(v: number[]): number[] {
  const n = Math.hypot(...v) || 1;
  return v.map((x) => x / n);
}

export async function embed(text: string): Promise<number[]> {
  return retryTransient(() => withTimeout(config.modelTimeoutMs, async (abortSignal) => {
    const res = await gemini().models.embedContent({
      model: config.embeddingModel,
      contents: text,
      config: { outputDimensionality: config.embeddingDims, taskType: "SEMANTIC_SIMILARITY", abortSignal },
    });
    const values = res.embeddings?.[0]?.values;
    if (!values?.length) throw new Error("Empty embedding");
    return normalise(values);
  }), { retries: 1, budgetMs: 10_000 });
}

/** Vision screening of a candidate GIF (script 04). Sends the small MP4 rendition. */
export async function screenGif(mp4Url: string, gloss: string, kind: string): Promise<ScreenResult> {
  const media = await fetch(mp4Url);
  if (!media.ok) throw new Error(`Could not fetch ${mp4Url}: ${media.status}`);
  const bytes = Buffer.from(await media.arrayBuffer());
  const mimeType = media.headers.get("content-type")?.split(";")[0] || "video/mp4";

  const caller: ModelCaller = (model, prompt) =>
    withTimeout(60_000, async (abortSignal) => {
      const res = await gemini().models.generateContent({
        model,
        contents: [
          {
            role: "user",
            parts: [{ inlineData: { mimeType, data: bytes.toString("base64") } }, { text: prompt }],
          },
        ],
        config: { temperature: 0, responseMimeType: "application/json", abortSignal },
      });
      return answerText(res.candidates?.[0]?.content?.parts);
    });

  const { value } = await generateValidated(caller, screenPrompt(gloss, kind), ScreenResult, {
    primary: config.visionModel,
  }, PATIENT);
  return value;
}

/** Wrap raw 16-bit PCM in a WAV header. */
export function pcmToWav(pcm: Buffer, sampleRate = 24000, channels = 1, bitsPerSample = 16): Buffer {
  const header = Buffer.alloc(44);
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE((channels * bitsPerSample) / 8, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

/**
 * Gemini TTS. Only the text itself is sent: instructions in the prompt get read
 * aloud. The language goes in speechConfig.languageCode instead.
 * Newer models return WAV; older ones return raw PCM (audio/L16;rate=24000).
 */
export async function synthesize(
  text: string,
  langCode: string,
): Promise<{ audio: Buffer; mimeType: "audio/wav"; durationMs: number }> {
  const languageCode = getLanguage(langCode)?.ttsCode;
  const request = (withLanguage: boolean) =>
    withTimeout(config.ttsTimeoutMs, (abortSignal) =>
      gemini().models.generateContent({
        model: config.ttsModel,
        contents: [{ role: "user", parts: [{ text }] }],
        config: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            ...(withLanguage && languageCode ? { languageCode } : {}),
            voiceConfig: { prebuiltVoiceConfig: { voiceName: config.ttsVoice } },
          },
          abortSignal,
        },
      }),
    );
  return retryTransient(async () => {
    let res;
    try {
      res = await request(true);
    } catch (e) {
      // An unsupported language code is a 400: try once more and let the model detect the language.
      if (!/INVALID_ARGUMENT|"code":\s*400/.test((e as Error).message)) throw e;
      res = await request(false);
    }
    const inline = res.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData;
    if (!inline?.data) throw new Error("TTS returned no audio");
    const raw = Buffer.from(inline.data, "base64");
    const isWav = raw.subarray(0, 4).toString("ascii") === "RIFF";
    const rate = Number(inline.mimeType?.match(/rate=(\d+)/)?.[1] ?? 24000);
    const audio = isWav ? raw : pcmToWav(raw, rate);
    const byteRate = audio.readUInt32LE(28) || rate * 2;
    const durationMs = Math.round(((audio.length - 44) / byteRate) * 1000);
    return { audio, mimeType: "audio/wav", durationMs };
  }, { retries: 2, budgetMs: 25_000 });
}
