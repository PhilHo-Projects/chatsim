// @vitest-environment node
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../db/migrations";
import { PersistentAuthAbuseLimiter } from "./abuseLimiter";

const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  "postgresql://chatsim_dev:chatsim_dev@127.0.0.1:54339/chatsim_test";
const adminPool = new Pool({ connectionString: testDatabaseUrl });
const pool = new Pool({
  connectionString: testDatabaseUrl,
  options: "-c search_path=auth_abuse_test"
});
let now: Date;
let limiter: PersistentAuthAbuseLimiter;

beforeAll(async () => {
  await adminPool.query("DROP SCHEMA IF EXISTS auth_abuse_test CASCADE");
  await adminPool.query("CREATE SCHEMA auth_abuse_test");
  await runMigrations(pool);
});

beforeEach(async () => {
  await pool.query("TRUNCATE auth_abuse_limit");
  now = new Date("2026-09-01T12:00:00.000Z");
  limiter = new PersistentAuthAbuseLimiter(pool, {
    now: () => now,
    secret: "a-test-secret-that-is-at-least-32-characters"
  });
});

afterAll(async () => {
  await pool.end();
  await adminPool.query("DROP SCHEMA IF EXISTS auth_abuse_test CASCADE");
  await adminPool.end();
});

describe("persistent auth abuse limiter", () => {
  it("blocks after five failed sign-ins and never persists the identifier", async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await limiter.check("sign_in_identifier", "Maya@Example.com", 5, 15 * 60);
      await limiter.record("sign_in_identifier", "Maya@Example.com", 15 * 60);
    }

    await expect(
      limiter.check("sign_in_identifier", "maya@example.com", 5, 15 * 60)
    ).rejects.toMatchObject({ retryAfterSeconds: 900 });
    const rows = await pool.query<{
      attempt_count: number;
      subject_hash: string;
    }>("SELECT subject_hash, attempt_count FROM auth_abuse_limit");

    expect(rows.rows).toEqual([
      {
        attempt_count: 5,
        subject_hash: expect.stringMatching(/^[a-f0-9]{64}$/)
      }
    ]);
    expect(JSON.stringify(rows.rows)).not.toContain("maya@example.com");
  });

  it("resets successful identifiers without weakening the IP counter", async () => {
    await limiter.record("sign_in_identifier", "maya", 15 * 60);
    await limiter.record("sign_in_ip", "203.0.113.10", 15 * 60);

    await limiter.reset("sign_in_identifier", "maya");

    expect(await pool.query("SELECT scope FROM auth_abuse_limit ORDER BY scope"))
      .toMatchObject({ rows: [{ scope: "sign_in_ip" }] });
  });

  it("keeps a blocked identifier closed through the final millisecond", async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await limiter.record("sign_in_identifier", "maya", 15 * 60);
    }
    now = new Date("2026-09-01T12:14:59.500Z");

    await expect(
      limiter.check("sign_in_identifier", "maya", 5, 15 * 60)
    ).rejects.toMatchObject({ retryAfterSeconds: 1 });
  });

  it("consumes three requests per window and reopens after expiry", async () => {
    for (let request = 0; request < 3; request += 1) {
      await expect(
        limiter.consume("reset_identifier", "maya@example.com", 3, 60 * 60)
      ).resolves.toBeUndefined();
    }
    await expect(
      limiter.consume("reset_identifier", "maya@example.com", 3, 60 * 60)
    ).rejects.toMatchObject({ retryAfterSeconds: 3600 });

    now = new Date("2026-09-01T13:00:01.000Z");
    await expect(
      limiter.consume("reset_identifier", "maya@example.com", 3, 60 * 60)
    ).resolves.toBeUndefined();
  });

  it("prunes identifiers older than the longest abuse-limit window", async () => {
    await limiter.record("sign_in_identifier", "stale@example.com", 15 * 60);
    now = new Date("2026-09-01T14:00:01.000Z");

    await limiter.consume("reset_identifier", "current@example.com", 3, 60 * 60);

    expect(
      await pool.query(
        "SELECT scope FROM auth_abuse_limit ORDER BY updated_at, scope"
      )
    ).toMatchObject({ rows: [{ scope: "reset_identifier" }] });
  });
});
