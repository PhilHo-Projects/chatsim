type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

type RateLimiterOptions = {
  limit: number;
  now?: () => number;
  windowMs: number;
};

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

export class InMemoryRateLimiter {
  private readonly entries = new Map<string, RateLimitEntry>();
  private readonly now: () => number;

  constructor(private readonly options: RateLimiterOptions) {
    this.now = options.now ?? Date.now;
  }

  check(key: string): RateLimitResult {
    const entry = this.currentEntry(key);

    if (!entry || entry.count < this.options.limit) {
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
}
