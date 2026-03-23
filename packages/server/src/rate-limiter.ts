/**
 * Sliding window rate limiter with pluggable storage.
 *
 * Ships with an in-memory implementation by default.
 */

export interface RateLimiterStore {
  /** Record a hit and return the current count within the window. */
  hit(key: string, windowMs: number): Promise<number>;
}

export interface RateLimiterConfig {
  /** Maximum requests per window. Default: 60 */
  maxRequests?: number;
  /** Window duration in ms. Default: 60_000 (1 minute) */
  windowMs?: number;
  /** Optional custom store. Defaults to in-memory. */
  store?: RateLimiterStore;
  /** Key extractor. Receives the request and returns a rate limit key (e.g., IP). */
  keyExtractor?: (req: { headers: Record<string, string> }) => string;
}

export interface RateLimiter {
  /** Returns true if the request is allowed, false if rate-limited. */
  check(req: { headers: Record<string, string> }): Promise<boolean>;
}

/**
 * In-memory sliding-window rate limiter store.
 */
export class MemoryRateLimiterStore implements RateLimiterStore {
  private windows = new Map<string, { count: number; expiresAt: number }>();
  private cleanupTimer?: ReturnType<typeof setInterval>;

  constructor() {
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.windows) {
        if (entry.expiresAt < now) this.windows.delete(key);
      }
    }, 60_000);
    if (this.cleanupTimer.unref) this.cleanupTimer.unref();
  }

  async hit(key: string, windowMs: number): Promise<number> {
    const now = Date.now();
    const existing = this.windows.get(key);

    if (existing && existing.expiresAt > now) {
      existing.count++;
      return existing.count;
    }

    this.windows.set(key, { count: 1, expiresAt: now + windowMs });
    return 1;
  }

  destroy(): void {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
  }
}

/**
 * Create a rate limiter from config.
 */
export function createRateLimiter(config?: RateLimiterConfig): RateLimiter {
  const maxRequests = config?.maxRequests ?? 60;
  const windowMs = config?.windowMs ?? 60_000;
  const store = config?.store ?? new MemoryRateLimiterStore();
  const keyExtractor = config?.keyExtractor ?? defaultKeyExtractor;

  return {
    async check(req: { headers: Record<string, string> }): Promise<boolean> {
      const key = keyExtractor(req);
      const count = await store.hit(key, windowMs);
      return count <= maxRequests;
    },
  };
}

function defaultKeyExtractor(req: { headers: Record<string, string> }): string {
  // Use x-forwarded-for (first IP), x-real-ip, or fall back to a generic key
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return `rl:${forwarded.split(',')[0].trim()}`;
  const realIp = req.headers['x-real-ip'];
  if (realIp) return `rl:${realIp}`;
  return 'rl:unknown';
}
