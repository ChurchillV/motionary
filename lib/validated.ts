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

/**
 * Ask a model for JSON and validate it with Zod.
 * Order: model → one repair retry → fallback model (with its own repair retry) → ModelError.
 */
export async function generateValidated<T>(
  call: ModelCaller,
  prompt: string,
  schema: z.ZodType<T>,
  models: { primary: string; fallback?: string | null },
): Promise<{ value: T; model: string }> {
  const attempts: string[] = [];
  const chain = [models.primary, models.fallback].filter((m): m is string => !!m);

  for (const model of [...new Set(chain)]) {
    let raw: string;
    try {
      raw = await call(model, prompt);
    } catch (e) {
      attempts.push(`${model}: ${(e as Error).message}`);
      continue;
    }
    const first = tryParse(raw, schema);
    if (first.ok) return { value: first.value, model };
    attempts.push(`${model}: ${first.error}`);

    try {
      const retryRaw = await call(model, repairPrompt(prompt, raw, first.error));
      const second = tryParse(retryRaw, schema);
      if (second.ok) return { value: second.value, model };
      attempts.push(`${model} (repair): ${second.error}`);
    } catch (e) {
      attempts.push(`${model} (repair): ${(e as Error).message}`);
    }
  }
  throw new ModelError("The model did not return usable JSON", attempts);
}
