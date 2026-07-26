type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

type RateLimiterOptions = {
  limit: number;
  maxEntries?: number;
  now?: () => number;
  windowMs: number;
};

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

export class InMemoryRateLimiter {
  private readonly entries = new Map<string, RateLimitEntry>();
  private readonly maxEntries: number;
  private readonly now: () => number;

  constructor(private readonly options: RateLimiterOptions) {
    this.maxEntries = Math.max(1, options.maxEntries ?? 10_000);
    this.now = options.now ?? Date.now;
  }

  check(key: string): RateLimitResult {
    const entry = this.currentEntry(key);

    if (!entry) {
      this.pruneExpired();

      if (this.entries.size >= this.maxEntries) {
        return {
          allowed: false,
          retryAfterSeconds: this.capacityRetryAfterSeconds()
        };
      }

      return { allowed: true };
    }

    if (entry.count < this.options.limit) {
      return { allowed: true };
    }

    return {
      allowed: false,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((entry.resetAt - this.now()) / 1000)
      )
    };
  }

  consume(key: string): RateLimitResult {
    const result = this.check(key);

    if (!result.allowed) {
      return result;
    }

    this.record(key);
    return { allowed: true };
  }

  record(key: string) {
    const current = this.currentEntry(key);

    if (current) {
      current.count += 1;
      return;
    }

    this.pruneExpired();

    if (this.entries.size >= this.maxEntries) {
      return;
    }

    this.entries.set(key, {
      count: 1,
      resetAt: this.now() + this.options.windowMs
    });
  }

  reset(key: string) {
    this.entries.delete(key);
  }

  private currentEntry(key: string) {
    const entry = this.entries.get(key);

    if (entry && entry.resetAt <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }

    return entry;
  }

  private pruneExpired() {
    const now = this.now();

    for (const [key, entry] of this.entries) {
      if (entry.resetAt <= now) {
        this.entries.delete(key);
      }
    }
  }

  private capacityRetryAfterSeconds() {
    const earliestReset = Math.min(
      ...[...this.entries.values()].map((entry) => entry.resetAt)
    );
    return Math.max(1, Math.ceil((earliestReset - this.now()) / 1000));
  }
}
