import { describe, expect, it } from "vitest";
import { SlidingWindowLimiter } from "@/lib/ratelimit";

describe("GIPHY rate limiter", () => {
  it("allows the limit per window, then refuses until the window slides", () => {
    let now = 0;
    const lim = new SlidingWindowLimiter(100, 3_600_000, () => now);
    for (let i = 0; i < 100; i++) {
      expect(lim.tryAcquire()).toBe(true);
      now += 1000;
    }
    expect(lim.tryAcquire()).toBe(false);
    expect(lim.remaining()).toBe(0);
    // First call was at t=0, so a slot frees at t=3_600_000.
    expect(lim.msUntilAvailable()).toBe(3_600_000 - now);
    now = 3_600_001;
    expect(lim.tryAcquire()).toBe(true);
  });

  it("keeps separate budgets per key", () => {
    const lim = new SlidingWindowLimiter(1, 60_000, () => 0);
    expect(lim.tryAcquire("a")).toBe(true);
    expect(lim.tryAcquire("a")).toBe(false);
    expect(lim.tryAcquire("b")).toBe(true);
  });
});
