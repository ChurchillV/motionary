import { describe, expect, it, vi } from "vitest";
import { RenderResult, ResolveResult } from "@/lib/schemas";
import { generateValidated, ModelError } from "@/lib/validated";

const good = {
  concept_id: "WAVE", english_gloss: "wave", kind: "gesture", gesture_id: "WAVE", item_concept_id: null, emoji: "👋",
  gif_search_terms: ["waving"], matched_form: null, alternatives: [], source: "model", confidence: "high",
};

describe("Zod parsing and repair path", () => {
  it("accepts a valid resolve result wrapped in code fences", async () => {
    const call = vi.fn().mockResolvedValue("Sure!\n```json\n" + JSON.stringify(good) + "\n```");
    const { value, model } = await generateValidated(call, "p", ResolveResult, { primary: "m1" });
    expect(value.concept_id).toBe("WAVE");
    expect(model).toBe("m1");
    expect(call).toHaveBeenCalledTimes(1);
  });

  it("retries once with the error in a repair prompt", async () => {
    const call = vi.fn().mockResolvedValueOnce('{"concept_id": "wave"}').mockResolvedValueOnce(JSON.stringify(good));
    const { value } = await generateValidated(call, "original prompt", ResolveResult, { primary: "m1" });
    expect(value.kind).toBe("gesture");
    const repair = call.mock.calls[1][1] as string;
    expect(repair).toContain("original prompt");
    expect(repair).toContain("Schema mismatch");
  });

  it("falls back to the second model after a failed repair", async () => {
    const call = vi.fn(async (model: string) => (model === "m2" ? JSON.stringify(good) : "not json at all"));
    const { model } = await generateValidated(call, "p", ResolveResult, { primary: "m1", fallback: "m2" });
    expect(model).toBe("m2");
    expect(call).toHaveBeenCalledTimes(3); // m1, m1 repair, m2
  });

  it("throws ModelError when every attempt fails", async () => {
    const call = vi.fn().mockRejectedValue(new Error("timeout"));
    await expect(generateValidated(call, "p", RenderResult, { primary: "a", fallback: "b" })).rejects.toBeInstanceOf(ModelError);
  });

  it("rejects lowercase concept ids and too many alternatives", () => {
    expect(ResolveResult.safeParse({ ...good, concept_id: "wave" }).success).toBe(false);
    const alts = Array.from({ length: 4 }, (_, i) => ({ concept_id: `A${i}`, english_gloss: "x" }));
    expect(ResolveResult.safeParse({ ...good, alternatives: alts }).success).toBe(false);
  });
});
