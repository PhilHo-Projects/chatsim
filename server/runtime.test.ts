// @vitest-environment node
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AuthRuntimeConfig } from "./auth/config";
import { InMemoryEmailSender } from "./auth/email";
import { createApplicationRuntime } from "./runtime";

const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  "postgresql://chatsim_dev:chatsim_dev@127.0.0.1:54339/chatsim_test";
const adminPool = new Pool({ connectionString: testDatabaseUrl });
const pool = new Pool({
  connectionString: testDatabaseUrl,
  options: "-c search_path=application_runtime_test"
});
const config: AuthRuntimeConfig = {
  adminBootstrapEmail: "admin@example.com",
  baseUrl: "http://127.0.0.1:5174",
  emailFrom: "Chatsim <accounts@example.com>",
  environment: "test",
  registrationMode: "closed",
  resendApiKey: null,
  secret: "a-test-secret-that-is-at-least-32-characters",
  trustedOrigins: ["http://127.0.0.1:5174"]
};

beforeAll(async () => {
  await adminPool.query("DROP SCHEMA IF EXISTS application_runtime_test CASCADE");
  await adminPool.query("CREATE SCHEMA application_runtime_test");
});

afterAll(async () => {
  await pool.end();
  await adminPool.query("DROP SCHEMA IF EXISTS application_runtime_test CASCADE");
  await adminPool.end();
});

describe("application runtime", () => {
  it("migrates once, then exposes auth, stories, and health on one pool", async () => {
    const runtime = await createApplicationRuntime({
      authConfig: config,
      pool,
      sender: new InMemoryEmailSender(),
      startCleanup: false
    });

    await runtime.store.seed();
    const health = await runtime.healthCheck();
    const authResponse = await runtime.authWebHandler(
      new Request(`${config.baseUrl}/api/auth/sign-up/email`, {
        body: JSON.stringify({
          email: "closed@example.com",
          name: "closed",
          password: "closed-password-2026",
          username: "closed"
        }),
        headers: {
          "Content-Type": "application/json",
          Origin: config.baseUrl
        },
        method: "POST"
      })
    );

    expect(health).toEqual({ auth: "ok", database: "ok" });
    expect(authResponse.status).toBe(403);
    expect(await runtime.store.getPublicProfiles()).toHaveLength(5);
    await runtime.close();
    await expect(pool.query("SELECT 1")).resolves.toBeTruthy();
  });

  it("does not read or clean the preserved legacy session table", async () => {
    const setupRuntime = await createApplicationRuntime({
      authConfig: config,
      pool,
      sender: new InMemoryEmailSender(),
      startCleanup: false
    });
    await setupRuntime.store.seed();
    await setupRuntime.close();
    await pool.query(
      `INSERT INTO sessions (token_hash, user_id, created_at, expires_at, last_seen_at)
       VALUES (decode('abcd', 'hex'), 'user-phil', '2020-01-01', '2020-01-02', '2020-01-01')
       ON CONFLICT (token_hash) DO NOTHING`
    );

    const runtime = await createApplicationRuntime({
      authConfig: config,
      pool,
      sender: new InMemoryEmailSender(),
      startCleanup: false
    });
    const legacySessions = await pool.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM sessions WHERE token_hash = decode('abcd', 'hex')"
    );

    expect(legacySessions.rows).toEqual([{ count: "1" }]);
    await runtime.close();
  });
});
