// @vitest-environment node
import { Pool } from "pg";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from "vitest";
import { runMigrations } from "../db/migrations";
import {
  buildChatsimAuth,
  createChatsimAuthWebHandler
} from "./betterAuth";
import type { AuthRuntimeConfig } from "./config";
import { InMemoryEmailSender } from "./email";

const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  "postgresql://chatsim_dev:chatsim_dev@127.0.0.1:54339/chatsim_test";
const adminPool = new Pool({ connectionString: testDatabaseUrl });
const pool = new Pool({
  connectionString: testDatabaseUrl,
  options: "-c search_path=better_auth_test"
});

function config(
  registrationMode: AuthRuntimeConfig["registrationMode"],
  environment: AuthRuntimeConfig["environment"] = "test"
): AuthRuntimeConfig {
  return {
    adminBootstrapEmail: "admin@example.com",
    baseUrl:
      environment === "production"
        ? "https://chatsim.example.com"
        : "http://127.0.0.1:5174",
    emailFrom: "Chatsim <accounts@example.com>",
    environment,
    registrationMode,
    resendApiKey: null,
    secret: "a-test-secret-that-is-at-least-32-characters",
    trustedOrigins: [
      environment === "production"
        ? "https://chatsim.example.com"
        : "http://127.0.0.1:5174"
    ]
  };
}

function authRequest(
  runtimeConfig: AuthRuntimeConfig,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {}
) {
  return new Request(`${runtimeConfig.baseUrl}${path}`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      Origin: runtimeConfig.baseUrl,
      ...headers
    },
    method: body === undefined ? "GET" : "POST",
    redirect: "manual"
  });
}

beforeAll(async () => {
  await adminPool.query("DROP SCHEMA IF EXISTS better_auth_test CASCADE");
  await adminPool.query("CREATE SCHEMA better_auth_test");
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
  await adminPool.query("DROP SCHEMA IF EXISTS better_auth_test CASCADE");
  await adminPool.end();
});

describe("Better Auth account lifecycle", () => {
  it("rejects sign-up server-side when registration is closed", async () => {
    const runtimeConfig = config("closed");
    const sender = new InMemoryEmailSender();
    const auth = buildChatsimAuth({ config: runtimeConfig, pool, sender });
    const response = await auth.handler(
      authRequest(runtimeConfig, "/api/auth/sign-up/email", {
        email: "maya@example.com",
        name: "maya",
        password: "maya-password-2026",
        username: "maya"
      })
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "REGISTRATION_CLOSED" });
    expect(await pool.query("SELECT id FROM auth_user")).toMatchObject({
      rowCount: 0
    });
  });

  it("creates an approved but unusable open account, then provisions after verification", async () => {
    const runtimeConfig = config("open");
    const sender = new InMemoryEmailSender();
    const auth = buildChatsimAuth({ config: runtimeConfig, pool, sender });
    const signUp = await auth.handler(
      authRequest(runtimeConfig, "/api/auth/sign-up/email", {
        callbackURL: `${runtimeConfig.baseUrl}/account?verified=1`,
        email: "maya@example.com",
        name: "Maya Should Not Be Stored",
        password: "maya-password-2026",
        username: "Maya-Story"
      })
    );
    await sender.settle();
    const beforeVerification = await pool.query<{
      approvalStatus: string;
      emailVerified: boolean;
      name: string;
      username: string;
    }>(
      `SELECT "approvalStatus", "emailVerified", name, username
       FROM auth_user`
    );

    expect(signUp.status).toBe(200);
    expect(signUp.headers.get("set-cookie")).toBeNull();
    expect(beforeVerification.rows).toEqual([
      {
        approvalStatus: "approved",
        emailVerified: false,
        name: "maya-story",
        username: "maya-story"
      }
    ]);
    expect(await pool.query("SELECT id FROM users")).toMatchObject({
      rowCount: 0
    });
    expect(sender.messages).toHaveLength(1);
    expect(sender.messages[0]).toMatchObject({
      kind: "verification",
      to: "maya@example.com"
    });

    const verificationUrl = new URL(
      sender.messages[0].text.match(/https?:\/\/\S+/)?.[0] ?? ""
    );
    const verification = await auth.handler(
      authRequest(runtimeConfig, `${verificationUrl.pathname}${verificationUrl.search}`)
    );
    const afterVerification = await pool.query<{
      auth_user_id: string;
      display_name: string;
      id: string;
      username: string;
    }>("SELECT id, username, display_name, auth_user_id FROM users");

    expect(verification.status).toBe(302);
    expect(verification.headers.get("location")).toBe(
      `${runtimeConfig.baseUrl}/account?verified=1`
    );
    expect(afterVerification.rows).toEqual([
      expect.objectContaining({
        auth_user_id: expect.any(String),
        display_name: "maya-story",
        id: expect.stringMatching(/^user-/),
        username: "maya-story"
      })
    ]);
  });

  it("repairs a missing creator profile when a verified approved account signs in", async () => {
    const runtimeConfig = config("open");
    const sender = new InMemoryEmailSender();
    const auth = buildChatsimAuth({ config: runtimeConfig, pool, sender });
    await auth.handler(
      authRequest(runtimeConfig, "/api/auth/sign-up/email", {
        email: "repair@example.com",
        name: "repair_user",
        password: "repair-password-2026",
        username: "repair_user"
      })
    );
    await sender.settle();
    const verificationUrl = new URL(
      sender.messages[0].text.match(/https?:\/\/\S+/)?.[0] ?? ""
    );
    await auth.handler(
      authRequest(
        runtimeConfig,
        `${verificationUrl.pathname}${verificationUrl.search}`
      )
    );
    await pool.query("DELETE FROM users");

    const signIn = await auth.handler(
      authRequest(runtimeConfig, "/api/auth/sign-in/username", {
        password: "repair-password-2026",
        username: "repair_user"
      })
    );
    const repaired = await pool.query<{
      auth_user_id: string;
      username: string;
    }>("SELECT auth_user_id, username FROM users");

    expect(signIn.status).toBe(200);
    expect(repaired.rows).toEqual([
      {
        auth_user_id: expect.any(String),
        username: "repair_user"
      }
    ]);
  });

  it("rejects common passwords before Better Auth persists anything", async () => {
    const runtimeConfig = config("open");
    const auth = buildChatsimAuth({
      config: runtimeConfig,
      pool,
      sender: new InMemoryEmailSender()
    });
    const response = await auth.handler(
      authRequest(runtimeConfig, "/api/auth/sign-up/email", {
        email: "weak@example.com",
        name: "weak",
        password: "password123",
        username: "weak"
      })
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "COMMON_PASSWORD" });
    expect(await pool.query("SELECT id FROM auth_user")).toMatchObject({
      rowCount: 0
    });
  });

  it("keeps an approval-mode identity pending after verification", async () => {
    const runtimeConfig = config("approval");
    const sender = new InMemoryEmailSender();
    const auth = buildChatsimAuth({ config: runtimeConfig, pool, sender });
    await auth.handler(
      authRequest(runtimeConfig, "/api/auth/sign-up/email", {
        callbackURL: `${runtimeConfig.baseUrl}/account?verified=1`,
        email: "pending@example.com",
        name: "pending",
        password: "pending-password-2026",
        username: "pending"
      })
    );
    await sender.settle();
    const verificationUrl = new URL(
      sender.messages[0].text.match(/https?:\/\/\S+/)?.[0] ?? ""
    );
    await auth.handler(
      authRequest(runtimeConfig, `${verificationUrl.pathname}${verificationUrl.search}`)
    );
    const signIn = await auth.handler(
      authRequest(runtimeConfig, "/api/auth/sign-in/username", {
        password: "pending-password-2026",
        username: "pending"
      })
    );
    const identity = await pool.query<{
      approvalStatus: string;
      emailVerified: boolean;
    }>(
      `SELECT "approvalStatus", "emailVerified" FROM auth_user
       WHERE username = 'pending'`
    );

    expect(identity.rows).toEqual([
      { approvalStatus: "pending", emailVerified: true }
    ]);
    expect(await pool.query("SELECT id FROM users")).toMatchObject({
      rowCount: 0
    });
    expect(signIn.status).toBe(403);
    expect(await signIn.json()).toMatchObject({ code: "ACCOUNT_PENDING" });
    expect(await pool.query("SELECT id FROM auth_session")).toMatchObject({
      rowCount: 0
    });
  });

  it("rejects seeded creator handles before creating an identity", async () => {
    const runtimeConfig = config("open");
    const auth = buildChatsimAuth({
      config: runtimeConfig,
      pool,
      sender: new InMemoryEmailSender()
    });
    await pool.query(
      `INSERT INTO users (id, username, display_name, role, accent_color)
       VALUES ('user-phil', 'phil', 'phil', 'member', '#f472b6')`
    );
    const response = await auth.handler(
      authRequest(runtimeConfig, "/api/auth/sign-up/email", {
        email: "not-phil@example.com",
        name: "phil",
        password: "not-phil-password-2026",
        username: "phil"
      })
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      code: "USERNAME_IS_ALREADY_TAKEN"
    });
    expect(await pool.query("SELECT id FROM auth_user")).toMatchObject({
      rowCount: 0
    });
  });

  it("rejects weak resets, accepts a strong reset, and revokes sessions", async () => {
    const runtimeConfig = config("open");
    const sender = new InMemoryEmailSender();
    const auth = buildChatsimAuth({ config: runtimeConfig, pool, sender });
    await auth.handler(
      authRequest(runtimeConfig, "/api/auth/sign-up/email", {
        callbackURL: `${runtimeConfig.baseUrl}/account?verified=1`,
        email: "reset@example.com",
        name: "reset_user",
        password: "before-reset-password-2026",
        username: "reset_user"
      })
    );
    await sender.settle();
    const verificationUrl = new URL(
      sender.messages[0].text.match(/https?:\/\/\S+/)?.[0] ?? ""
    );
    await auth.handler(
      authRequest(runtimeConfig, `${verificationUrl.pathname}${verificationUrl.search}`)
    );
    await auth.handler(
      authRequest(runtimeConfig, "/api/auth/sign-in/username", {
        password: "before-reset-password-2026",
        username: "reset_user"
      })
    );
    await auth.handler(
      authRequest(runtimeConfig, "/api/auth/request-password-reset", {
        email: "reset@example.com",
        redirectTo: `${runtimeConfig.baseUrl}/account`
      })
    );
    await sender.settle();
    const resetUrl = new URL(
      sender.messages.find((message) => message.kind === "password-reset")
        ?.text.match(/https?:\/\/\S+/)?.[0] ?? ""
    );
    const token = resetUrl.pathname.split("/").at(-1) ?? "";
    const weakReset = await auth.handler(
      authRequest(runtimeConfig, "/api/auth/reset-password", {
        newPassword: "password123",
        token
      })
    );
    const strongReset = await auth.handler(
      authRequest(runtimeConfig, "/api/auth/reset-password", {
        newPassword: "after-reset-password-2026",
        token
      })
    );

    expect(weakReset.status).toBe(400);
    expect(await weakReset.json()).toMatchObject({ code: "COMMON_PASSWORD" });
    expect(strongReset.status).toBe(200);
    expect(await pool.query("SELECT id FROM auth_session")).toMatchObject({
      rowCount: 0
    });
    const signIn = await auth.handler(
      authRequest(runtimeConfig, "/api/auth/sign-in/email", {
        email: "reset@example.com",
        password: "after-reset-password-2026"
      })
    );
    expect(signIn.status).toBe(200);
  });

  it("rejects common passwords during an authenticated password change", async () => {
    const runtimeConfig = config("open");
    const sender = new InMemoryEmailSender();
    const auth = buildChatsimAuth({ config: runtimeConfig, pool, sender });
    await auth.handler(
      authRequest(runtimeConfig, "/api/auth/sign-up/email", {
        callbackURL: `${runtimeConfig.baseUrl}/account?verified=1`,
        email: "change@example.com",
        name: "change_user",
        password: "before-change-password-2026",
        username: "change_user"
      })
    );
    await sender.settle();
    const verificationUrl = new URL(
      sender.messages[0].text.match(/https?:\/\/\S+/)?.[0] ?? ""
    );
    await auth.handler(
      authRequest(runtimeConfig, `${verificationUrl.pathname}${verificationUrl.search}`)
    );
    const signIn = await auth.handler(
      authRequest(runtimeConfig, "/api/auth/sign-in/username", {
        password: "before-change-password-2026",
        username: "change_user"
      })
    );
    const cookie = signIn.headers.get("set-cookie")?.split(";")[0] ?? "";
    const weakChange = await auth.handler(
      authRequest(
        runtimeConfig,
        "/api/auth/change-password",
        {
          currentPassword: "before-change-password-2026",
          newPassword: "password123",
          revokeOtherSessions: true
        },
        { Cookie: cookie }
      )
    );

    expect(signIn.status).toBe(200);
    expect(weakChange.status).toBe(400);
    expect(await weakChange.json()).toMatchObject({ code: "COMMON_PASSWORD" });
  });

  it("keeps signup successful when asynchronous email delivery fails", async () => {
    const runtimeConfig = config("open");
    const sender = new InMemoryEmailSender();
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    sender.failNext(new Error("provider unavailable"));
    const auth = buildChatsimAuth({ config: runtimeConfig, pool, sender });
    const response = await auth.handler(
      authRequest(runtimeConfig, "/api/auth/sign-up/email", {
        email: "mailfail@example.com",
        name: "mailfail",
        password: "mail-failure-password-2026",
        username: "mailfail"
      })
    );
    await sender.settle();

    expect(response.status).toBe(200);
    expect(await pool.query("SELECT id FROM auth_user")).toMatchObject({
      rowCount: 1
    });
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({ event: "auth_email_delivery_failed" })
    );
    log.mockRestore();
  });

  it("answers duplicate-email signups generically", async () => {
    const runtimeConfig = config("open");
    const sender = new InMemoryEmailSender();
    const auth = buildChatsimAuth({ config: runtimeConfig, pool, sender });
    const first = await auth.handler(
      authRequest(runtimeConfig, "/api/auth/sign-up/email", {
        email: "duplicate@example.com",
        name: "duplicate_one",
        password: "duplicate-password-2026",
        username: "duplicate_one"
      })
    );
    const duplicate = await auth.handler(
      authRequest(runtimeConfig, "/api/auth/sign-up/email", {
        email: "duplicate@example.com",
        name: "duplicate_two",
        password: "different-password-2026",
        username: "duplicate_two"
      })
    );

    expect(first.status).toBe(200);
    expect(duplicate.status).toBe(200);
    expect(await duplicate.json()).toMatchObject({
      token: null,
      user: { email: "duplicate@example.com" }
    });
    expect(await pool.query("SELECT id FROM auth_user")).toMatchObject({
      rowCount: 1
    });
  });

  it("uses the production __Host cookie with hardened attributes", async () => {
    const runtimeConfig = config("open", "production");
    const sender = new InMemoryEmailSender();
    const auth = buildChatsimAuth({ config: runtimeConfig, pool, sender });
    await auth.handler(
      authRequest(runtimeConfig, "/api/auth/sign-up/email", {
        email: "cookie@example.com",
        name: "cookie",
        password: "cookie-password-2026",
        username: "cookie"
      })
    );
    await sender.settle();
    const verificationUrl = new URL(
      sender.messages[0].text.match(/https?:\/\/\S+/)?.[0] ?? ""
    );
    await auth.handler(
      authRequest(runtimeConfig, `${verificationUrl.pathname}${verificationUrl.search}`)
    );
    const signIn = await auth.handler(
      authRequest(runtimeConfig, "/api/auth/sign-in/username", {
        password: "cookie-password-2026",
        username: "cookie"
      })
    );
    const cookie = signIn.headers.get("set-cookie");

    expect(signIn.status).toBe(200);
    expect(cookie).toMatch(/^__Host-chatsim_session=/);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("Max-Age=2592000");
    expect(cookie).not.toContain("Domain=");
    expect(
      await pool.query(
        `SELECT EXTRACT(EPOCH FROM ("expiresAt" - "createdAt"))::int AS lifetime
         FROM auth_session`
      )
    ).toMatchObject({ rows: [{ lifetime: 2592000 }] });
  });

  it("persists hashed identifier and IP failure limits across handlers", async () => {
    const runtimeConfig = config("open");
    const sender = new InMemoryEmailSender();
    const auth = buildChatsimAuth({ config: runtimeConfig, pool, sender });
    const firstHandler = createChatsimAuthWebHandler({
      auth,
      config: runtimeConfig,
      pool
    });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await firstHandler(
        authRequest(
          runtimeConfig,
          "/api/auth/sign-in/username",
          { password: "wrong-password-2026", username: "MissingUser" },
          { "X-Real-IP": "203.0.113.25" }
        )
      );

      expect(response.status).toBe(401);
    }

    const secondHandler = createChatsimAuthWebHandler({
      auth,
      config: runtimeConfig,
      pool
    });
    const blocked = await secondHandler(
      authRequest(
        runtimeConfig,
        "/api/auth/sign-in/username",
        { password: "wrong-password-2026", username: "missinguser" },
        { "X-Real-IP": "203.0.113.25" }
      )
    );
    const persisted = await pool.query<{
      attempt_count: number;
      scope: string;
      subject_hash: string;
    }>(
      `SELECT scope, subject_hash, attempt_count
       FROM auth_abuse_limit ORDER BY scope`
    );

    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBeTruthy();
    expect(await blocked.json()).toEqual({
      code: "TOO_MANY_REQUESTS",
      error: "Too many authentication attempts. Try again later."
    });
    expect(persisted.rows).toEqual([
      {
        attempt_count: 5,
        scope: "sign_in_identifier",
        subject_hash: expect.stringMatching(/^[a-f0-9]{64}$/)
      },
      {
        attempt_count: 5,
        scope: "sign_in_ip",
        subject_hash: expect.stringMatching(/^[a-f0-9]{64}$/)
      }
    ]);
    expect(JSON.stringify(persisted.rows)).not.toContain("missinguser");
    expect(JSON.stringify(persisted.rows)).not.toContain("203.0.113.25");
  });
});
