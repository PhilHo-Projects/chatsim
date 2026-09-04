// @vitest-environment node
import { Pool } from "pg";
import { verifyPassword } from "better-auth/crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../db/migrations";
import { StoryStore } from "../storyStore";
import { bootstrapBetterAuthAdmin } from "./bootstrap";

const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  "postgresql://chatsim_dev:chatsim_dev@127.0.0.1:54339/chatsim_test";
const adminPool = new Pool({ connectionString: testDatabaseUrl });
const pool = new Pool({
  connectionString: testDatabaseUrl,
  options: "-c search_path=auth_bootstrap_test"
});

beforeAll(async () => {
  await adminPool.query("DROP SCHEMA IF EXISTS auth_bootstrap_test CASCADE");
  await adminPool.query("CREATE SCHEMA auth_bootstrap_test");
  await runMigrations(pool);
});

beforeEach(async () => {
  await pool.query(
    `TRUNCATE auth_account_action_audit, auth_abuse_limit, auth_rate_limit,
       auth_verification, auth_account, auth_session, stories, images, users,
       auth_user, sessions RESTART IDENTITY CASCADE`
  );
});

afterAll(async () => {
  await pool.end();
  await adminPool.query("DROP SCHEMA IF EXISTS auth_bootstrap_test CASCADE");
  await adminPool.end();
});

describe("Better Auth admin bootstrap", () => {
  it("concurrently links user-admin once, rehashes the password, and creates no session", async () => {
    const store = await StoryStore.open({
      pool,
      runMigrations: false,
      startCleanup: false
    });
    await store.bootstrapAdmin({
      displayName: "Chatsim Admin",
      password: "admin-password-2026",
      username: "chatsim_admin"
    });
    const legacy = await pool.query<{ password_hash: string }>(
      "SELECT password_hash FROM users WHERE id = 'user-admin'"
    );

    const [first, raced] = await Promise.all([
      bootstrapBetterAuthAdmin(pool, {
        email: "Admin@Example.com",
        password: "admin-password-2026",
        username: "chatsim_admin"
      }),
      bootstrapBetterAuthAdmin(pool, {
        email: "admin@example.com",
        password: "admin-password-2026",
        username: "chatsim_admin"
      })
    ]);
    const identity = await pool.query<{
      approvalStatus: string;
      emailVerified: boolean;
      id: string;
      role: string;
    }>(
      `SELECT id, role, "approvalStatus", "emailVerified" FROM auth_user`
    );
    const credential = await pool.query<{ password: string }>(
      "SELECT password FROM auth_account WHERE \"providerId\" = 'credential'"
    );
    const profile = await pool.query<{ auth_user_id: string }>(
      "SELECT auth_user_id FROM users WHERE id = 'user-admin'"
    );
    const audit = await pool.query(
      `SELECT id FROM auth_account_action_audit
       WHERE action = 'admin_bootstrapped'`
    );

    expect(first.authUserId).toBe(raced.authUserId);
    expect(identity.rows).toEqual([
      {
        approvalStatus: "approved",
        emailVerified: true,
        id: first.authUserId,
        role: "admin"
      }
    ]);
    expect(profile.rows).toEqual([{ auth_user_id: first.authUserId }]);
    expect(credential.rows[0].password).not.toBe(legacy.rows[0].password_hash);
    await expect(
      verifyPassword({
        hash: credential.rows[0].password,
        password: "admin-password-2026"
      })
    ).resolves.toBe(true);
    expect(audit.rowCount).toBe(1);
    expect(await pool.query("SELECT id FROM auth_session")).toMatchObject({
      rowCount: 0
    });
  });

  it("is a no-op on rerun and does not silently replace the password", async () => {
    await bootstrapBetterAuthAdmin(pool, {
      email: "admin@example.com",
      password: "first-admin-password-2026",
      username: "chatsim_admin"
    });
    await bootstrapBetterAuthAdmin(pool, {
      email: "admin@example.com",
      password: "replacement-password-2026",
      username: "chatsim_admin"
    });
    const credential = await pool.query<{ password: string }>(
      "SELECT password FROM auth_account WHERE \"providerId\" = 'credential'"
    );

    await expect(
      verifyPassword({
        hash: credential.rows[0].password,
        password: "first-admin-password-2026"
      })
    ).resolves.toBe(true);
    await expect(
      verifyPassword({
        hash: credential.rows[0].password,
        password: "replacement-password-2026"
      })
    ).resolves.toBe(false);
    expect(await pool.query("SELECT id FROM auth_user")).toMatchObject({
      rowCount: 1
    });
  });

  it("refuses to promote an unlinked identity that collides with the bootstrap account", async () => {
    await pool.query(
      `INSERT INTO users (id, username, display_name, role, accent_color)
       VALUES ('user-admin', 'chatsim_admin', 'Chatsim Admin', 'admin', '#8b5cf6')`
    );
    await pool.query(
      `INSERT INTO auth_user (
         id, name, email, "emailVerified", username, role, banned,
         "approvalStatus"
       ) VALUES (
         'attacker-identity', 'chatsim_admin', 'admin@example.com', FALSE,
         'chatsim_admin', 'user', FALSE, 'pending'
       )`
    );

    await expect(
      bootstrapBetterAuthAdmin(pool, {
        email: "admin@example.com",
        password: "admin-password-2026",
        username: "chatsim_admin"
      })
    ).rejects.toThrow("already belongs to an unlinked identity");

    expect(
      await pool.query(
        `SELECT role, "emailVerified", "approvalStatus"
         FROM auth_user WHERE id = 'attacker-identity'`
      )
    ).toMatchObject({
      rows: [
        {
          approvalStatus: "pending",
          emailVerified: false,
          role: "user"
        }
      ]
    });
    expect(
      await pool.query(
        "SELECT auth_user_id FROM users WHERE id = 'user-admin'"
      )
    ).toMatchObject({ rows: [{ auth_user_id: null }] });
  });
});
