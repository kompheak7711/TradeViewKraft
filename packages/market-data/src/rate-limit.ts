/** Simple token bucket to stay inside provider rate limits (client side). */
export class TokenBucket {
  private tokens: number;
  private last: number;
  constructor(private readonly capacity: number, private readonly refillPerSec: number, private readonly now: () => number = Date.now) {
    this.tokens = capacity;
    this.last = now();
  }
  /** Resolves when a token is available. */
  async take(): Promise<void> {
    for (;;) {
      this.refill();
      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }
      const wait = Math.ceil(((1 - this.tokens) / this.refillPerSec) * 1000);
      await new Promise((r) => setTimeout(r, Math.max(10, wait)));
    }
  }
  private refill(): void {
    const t = this.now();
    const delta = (t - this.last) / 1000;
    this.last = t;
    this.tokens = Math.min(this.capacity, this.tokens + delta * this.refillPerSec);
  }
}

/** TTL cache for quotes / history pages so repeated requests stay inside free quotas. */
export class TtlCache<V> {
  private map = new Map<string, { v: V; exp: number }>();
  constructor(private readonly ttlMs: number, private readonly now: () => number = Date.now) {}
  get(key: string): V | undefined {
    const e = this.map.get(key);
    if (!e) return undefined;
    if (e.exp < this.now()) {
      this.map.delete(key);
      return undefined;
    }
    return e.v;
  }
  set(key: string, v: V, ttlMs = this.ttlMs): void {
    this.map.set(key, { v, exp: this.now() + ttlMs });
  }
}
