// @vitest-environment node
import { describe, expect, it } from "vitest";
import { InMemoryRateLimiter } from "./rateLimiter";

describe("InMemoryRateLimiter", () => {
  it("blocks an identity until its fixed window expires", () => {
    let now = 1_000;
    const limiter = new InMemoryRateLimiter({
      limit: 2,
      now: () => now,
      windowMs: 10_000
    });

    expect(limiter.consume("ip:127.0.0.1")).toEqual({ allowed: true });
    expect(limiter.consume("ip:127.0.0.1")).toEqual({ allowed: true });
    expect(limiter.consume("ip:127.0.0.1")).toEqual({
      allowed: false,
      retryAfterSeconds: 10
    });

    now = 11_001;

    expect(limiter.consume("ip:127.0.0.1")).toEqual({ allowed: true });
  });

  it("can count only failures and clears a username after success", () => {
    const limiter = new InMemoryRateLimiter({
      limit: 2,
      now: () => 1_000,
      windowMs: 10_000
    });

    limiter.record("username:maya");
    limiter.record("username:maya");

    expect(limiter.check("username:maya")).toMatchObject({
      allowed: false
    });

    limiter.reset("username:maya");

    expect(limiter.check("username:maya")).toEqual({ allowed: true });
  });
});
