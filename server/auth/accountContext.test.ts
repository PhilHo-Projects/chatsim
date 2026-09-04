// @vitest-environment node
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../db/migrations";
import { getCurrentAccount, resolveAuthenticatedActor } from "./accountContext";
import { buildChatsimAuth } from "./betterAuth";
import type { AuthRuntimeConfig } from "./config";
import { InMemoryEmailSender } from "./email";

const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  "postgresql://chatsim_dev:chatsim_dev@127.0.0.1:54339/chatsim_test";
const adminPool = new Pool({ connectionString: testDatabaseUrl });
const pool = new Pool({
  connectionString: testDatabaseUrl,
  options: "-c search_path=account_context_test"
});
const config: AuthRuntimeConfig = {
  adminBootstrapEmail: "admin@example.com",
  baseUrl: "http://127.0.0.1:5174",
  emailFrom: "Chatsim <accounts@example.com>",
  environment: "test",
  registrationMode: "open",
  resendApiKey: null,
  secret: "a-test-secret-that-is-at-least-32-characters",
  trustedOrigins: ["http://127.0.0.1:5174"]
};

function request(path: string, body?: unknown, cookie?: string) {
  return new Request(`${config.baseUrl}${path}`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(cookie ? { Cookie: cookie } : {}),
      Origin: config.baseUrl
    },
    method: body === undefined ? "GET" : "POST",
    redirect: "manual"
  });
}

beforeAll(async () => {
  await adminPool.query("DROP SCHEMA IF EXISTS account_context_test CASCADE");
  await adminPool.query("CREATE SCHEMA account_context_test");
  await runMigrations(pool);
});

beforeEach(async () => {
  await pool.query(
    `TRUNCATE auth_account_action_audit, auth_abuse_limit, auth_rate_limit,
       auth_verification, auth_account, auth_session, stories, images, users,
       auth_user RESTART IDENTITY CASCADE`
  );
});

afterAll(async () => {
  await pool.end();
  await adminPool.query("DROP SCHEMA IF EXISTS account_context_test CASCADE");
  await adminPool.end();
});

describe("current account context", () => {
  it("uses only the Better Auth role when resolving an actor", async () => {
    const sender = new InMemoryEmailSender();
    const auth = buildChatsimAuth({ config, pool, sender });
    await auth.handler(
      request("/api/auth/sign-up/email", {
        callbackURL: `${config.baseUrl}/account?verified=1`,
        email: "maya@example.com",
        name: "maya",
        password: "maya-password-2026",
        username: "maya"
      })
    );
    await sender.settle();
    const verificationUrl = new URL(
      sender.messages[0].text.match(/https?:\/\/\S+/)?.[0] ?? ""
    );
    await auth.handler(
      request(`${verificationUrl.pathname}${verificationUrl.search}`)
    );
    const signIn = await auth.handler(
      request("/api/auth/sign-in/username", {
        password: "maya-password-2026",
        username: "maya"
      })
    );
    const cookie = signIn.headers.get("set-cookie")?.split(";")[0];
    const profile = await pool.query<{ id: string }>(
      "SELECT id FROM users WHERE username = 'maya'"
    );

    await pool.query("UPDATE users SET role = 'admin' WHERE username = 'maya'");
    const current = await getCurrentAccount({
      auth,
      config,
      headers: new Headers({ Cookie: cookie ?? "" }),
      pool
    });
    const actor = resolveAuthenticatedActor(current);

    expect(current).toMatchObject({
      account: {
        approvalStatus: "approved",
        disabled: false,
        email: "maya@example.com",
        emailVerified: true,
        role: "user",
        username: "maya"
      },
      profile: {
        displayName: "maya",
        id: profile.rows[0].id,
        username: "maya"
      },
      registrationMode: "open",
      session: { expiresAt: expect.any(String) }
    });
    expect(actor).toEqual({
      authUserId: current.account?.id,
      profileId: profile.rows[0].id,
      role: "user"
    });
  });

  it("returns the deployment mode without inventing an anonymous identity", async () => {
    const auth = buildChatsimAuth({
      config,
      pool,
      sender: new InMemoryEmailSender()
    });

    await expect(
      getCurrentAccount({ auth, config, headers: new Headers(), pool })
    ).resolves.toEqual({
      account: null,
      profile: null,
      registrationMode: "open",
      session: null
    });
  });
});
