import { describe, expect, it, vi } from "vitest";
import { ResolveResult } from "@/lib/schemas";
import { generateValidated, isTransient, retryTransient } from "@/lib/validated";

const good = JSON.stringify({
  concept_id: "WAVE", english_gloss: "wave", kind: "gesture", gesture_id: "WAVE", item_concept_id: null, emoji: "👋",
  gif_search_terms: [], matched_form: null, alternatives: [], source: "model", confidence: "high",
});
const google500 = () => new Error('{"error":{"code":500,"message":"Internal error encountered.","status":"INTERNAL"}}');
const noSleep = { sleep: async () => {} };

describe("transient error detection", () => {
  it("retries Google 5xx, overload, rate limits, timeouts and dropped connections", () => {
    expect(isTransient(google500())).toBe(true);
    expect(isTransient(new Error('{"error":{"code":503,"message":"This model is currently experiencing high demand."}}'))).toBe(true);
    expect(isTransient(new Error("Timed out after 15000 ms"))).toBe(true);
    expect(isTransient(new Error("fetch failed"))).toBe(true);
    expect(isTransient(Object.assign(new Error("x"), { status: 429 }))).toBe(true);
  });

  it("does not retry real errors", () => {
    expect(isTransient(new Error('{"error":{"code":400,"message":"Thinking budget is not supported","status":"INVALID_ARGUMENT"}}'))).toBe(false);
    expect(isTransient(Object.assign(new Error("bad key"), { status: 403 }))).toBe(false);
    expect(isTransient(new Error("Empty model response"))).toBe(false);
    expect(isTransient(new Error('{"error":{"code":429,"details":[{"quotaId":"GenerateRequestsPerDayPerProjectPerModel-FreeTier"}]}}'))).toBe(false);
  });
});

describe("generateValidated retries", () => {
  it("retries the same model after a Google 500, then succeeds", async () => {
    const call = vi.fn().mockRejectedValueOnce(google500()).mockResolvedValueOnce(good);
    const { model } = await generateValidated(call, "p", ResolveResult, { primary: "gemma" }, noSleep);
    expect(model).toBe("gemma");
    expect(call).toHaveBeenCalledTimes(2);
  });

  it("gives up after the retry limit and moves to the fallback model", async () => {
    const call = vi.fn(async (model: string) => {
      if (model === "big") throw google500();
      return good;
    });
    const { model } = await generateValidated(call, "p", ResolveResult, { primary: "big", fallback: "small" }, { ...noSleep, retries: 2 });
    expect(model).toBe("small");
    expect(call.mock.calls.filter(([m]) => m === "big")).toHaveLength(3); // first try + 2 retries
  });

  it("never retries a non-transient error", async () => {
    const call = vi.fn().mockRejectedValue(new Error('{"error":{"code":400,"status":"INVALID_ARGUMENT"}}'));
    await expect(generateValidated(call, "p", ResolveResult, { primary: "m" }, noSleep)).rejects.toThrow();
    expect(call).toHaveBeenCalledTimes(1);
  });

  it("stops retrying once the time budget is used up", async () => {
    let t = 0;
    const call = vi.fn(async () => {
      t += 20_000; // each failed call takes 20 s
      throw new Error("Timed out after 20000 ms");
    });
    await expect(
      generateValidated(call, "p", ResolveResult, { primary: "m" }, { ...noSleep, now: () => t, budgetMs: 30_000, retries: 5 }),
    ).rejects.toThrow();
    expect(call).toHaveBeenCalledTimes(2); // 20 s, then 40 s > budget
  });

  it("backs off longer each retry", async () => {
    const delays: number[] = [];
    const call = vi.fn().mockRejectedValueOnce(google500()).mockRejectedValueOnce(google500()).mockResolvedValueOnce(good);
    await generateValidated(call, "p", ResolveResult, { primary: "m" }, { sleep: async (ms) => void delays.push(ms), baseDelayMs: 1000 });
    expect(delays).toHaveLength(2);
    expect(delays[0]).toBeGreaterThanOrEqual(750);
    expect(delays[0]).toBeLessThanOrEqual(1250);
    expect(delays[1]).toBeGreaterThanOrEqual(1500);
  });
});

describe("retryTransient", () => {
  it("retries TTS-style calls on transient errors only", async () => {
    const fn = vi.fn().mockRejectedValueOnce(google500()).mockResolvedValueOnce("audio");
    await expect(retryTransient(fn, noSleep)).resolves.toBe("audio");
    const bad = vi.fn().mockRejectedValue(new Error("Empty model response"));
    await expect(retryTransient(bad, noSleep)).rejects.toThrow();
    expect(bad).toHaveBeenCalledTimes(1);
  });
});
