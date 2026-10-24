/**
 * Sliding-window rate limiter. Used for the GIPHY beta budget (100 calls/hour)
 * and the per-IP audio limit. In memory, so each process has its own budget.
 */
export class SlidingWindowLimiter {
  private hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  private prune(key: string): number[] {
    const cutoff = this.now() - this.windowMs;
    const list = (this.hits.get(key) ?? []).filter((t) => t > cutoff);
    this.hits.set(key, list);
    return list;
  }

  /** Take one slot if available. Returns false when the budget is spent. */
  tryAcquire(key = "default"): boolean {
    const list = this.prune(key);
    if (list.length >= this.limit) return false;
    list.push(this.now());
    return true;
  }

  remaining(key = "default"): number {
    return Math.max(0, this.limit - this.prune(key).length);
  }

  /** Milliseconds until the next slot frees up (0 if one is free now). */
  msUntilAvailable(key = "default"): number {
    const list = this.prune(key);
    if (list.length < this.limit) return 0;
    return list[0] + this.windowMs - this.now();
  }
}
