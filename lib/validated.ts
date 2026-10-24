import type { z } from "zod";
import { stripFences } from "./text";

/** A function that sends a prompt to a model and returns its raw text. */
export type ModelCaller = (model: string, prompt: string) => Promise<string>;

export class ModelError extends Error {
  constructor(message: string, readonly attempts: string[]) {
    super(message);
    this.name = "ModelError";
  }
}

function tryParse<T>(raw: string, schema: z.ZodType<T>): { ok: true; value: T } | { ok: false; error: string } {
  let json: unknown;
  try {
    json = JSON.parse(stripFences(raw));
  } catch (e) {
    return { ok: false, error: `Invalid JSON: ${(e as Error).message}` };
  }
  const parsed = schema.safeParse(json);
  if (parsed.success) return { ok: true, value: parsed.data };
  const issues = parsed.error.issues
    .slice(0, 6)
    .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("; ");
  return { ok: false, error: `Schema mismatch: ${issues}` };
}

export function repairPrompt(original: string, badOutput: string, error: string): string {
  return `${original}

Your previous answer could not be used.
Problem: ${error}
Previous answer:
${badOutput.slice(0, 2000)}

Reply again with ONLY the corrected JSON object. No prose, no code fences.`;
}

/** Errors worth retrying: Google 5xx/overload, rate limits, timeouts, dropped connections. */
export function isTransient(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  // A daily quota won't clear in seconds; retrying only delays the error.
  if (/PerDay/i.test(msg)) return false;
  const status = (e as { status?: number })?.status;
  if (typeof status === "number") return status === 429 || status >= 500;
  return /"code":\s*(429|5\d\d)|\b(INTERNAL|UNAVAILABLE|RESOURCE_EXHAUSTED|DEADLINE_EXCEEDED)\b|high demand|overloaded|Timed out|fetch failed|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up/i.test(msg);
}

export type RetryOptions = {
  /** Extra attempts per call after a transient error (default 2). */
  retries?: number;
  /** First backoff delay; doubles each retry, with jitter (default 700 ms). */
  baseDelayMs?: number;
  /** No new retry starts after this much total time (default 30 s). The fallback model is always tried once. */
  budgetMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
};

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Ask a model for JSON and validate it with Zod.
 * Order: model (retrying transient errors) → one repair retry → fallback model (same) → ModelError.
 */
export async function generateValidated<T>(
  call: ModelCaller,
  prompt: string,
  schema: z.ZodType<T>,
  models: { primary: string; fallback?: string | null },
  retry: RetryOptions = {},
): Promise<{ value: T; model: string }> {
  const { retries = 2, baseDelayMs = 700, budgetMs = 30_000, sleep = defaultSleep, now = Date.now } = retry;
  const deadline = now() + budgetMs;
  const attempts: string[] = [];
  const chain = [models.primary, models.fallback].filter((m): m is string => !!m);

  /** One logical call, retried on transient errors while time remains. */
  const callWithRetry = async (model: string, text: string, label: string): Promise<string> => {
    for (let attempt = 0; ; attempt++) {
      try {
        return await call(model, text);
      } catch (e) {
        const delay = baseDelayMs * 2 ** attempt * (0.75 + Math.random() * 0.5);
        const canRetry = attempt < retries && isTransient(e) && now() + delay < deadline;
        attempts.push(`${label}${attempt ? ` (retry ${attempt})` : ""}: ${(e as Error).message?.slice(0, 200)}`);
        if (!canRetry) throw e;
        await sleep(delay);
      }
    }
  };

  for (const model of [...new Set(chain)]) {
    let raw: string;
    try {
      raw = await callWithRetry(model, prompt, model);
    } catch {
      continue;
    }
    const first = tryParse(raw, schema);
    if (first.ok) return { value: first.value, model };
    attempts.push(`${model}: ${first.error}`);

    try {
      const retryRaw = await callWithRetry(model, repairPrompt(prompt, raw, first.error), `${model} (repair)`);
      const second = tryParse(retryRaw, schema);
      if (second.ok) return { value: second.value, model };
      attempts.push(`${model} (repair): ${second.error}`);
    } catch {
      // logged in callWithRetry
    }
  }
  throw new ModelError("The model did not return usable JSON", attempts);
}

/** Retry any async call on transient errors (used for TTS and embeddings). */
export async function retryTransient<T>(fn: () => Promise<T>, retry: RetryOptions = {}): Promise<T> {
  const { retries = 2, baseDelayMs = 700, budgetMs = 30_000, sleep = defaultSleep, now = Date.now } = retry;
  const deadline = now() + budgetMs;
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      const delay = baseDelayMs * 2 ** attempt * (0.75 + Math.random() * 0.5);
      if (attempt >= retries || !isTransient(e) || now() + delay >= deadline) throw e;
      await sleep(delay);
    }
  }
}

/** Background scripts can wait out a busy model much longer than a learner can. */
export const PATIENT: RetryOptions = { retries: 5, baseDelayMs: 3000, budgetMs: 180_000 };
