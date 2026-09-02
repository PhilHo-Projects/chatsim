// @vitest-environment node
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../db/migrations";
import {
  approveAccount,
  listAccounts,
  provisionCreatorProfile,
  rejectAccount,
  revokeAccountSessions,
  setAccountDisabled
} from "./accounts";

const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  "postgresql://chatsim_dev:chatsim_dev@127.0.0.1:54339/chatsim_test";
const adminPool = new Pool({ connectionString: testDatabaseUrl });
const pool = new Pool({
  connectionString: testDatabaseUrl,
  options: "-c search_path=auth_accounts_test"
});

async function insertIdentity(input: {
  approvalStatus?: "approved" | "pending" | "rejected";
  emailVerified?: boolean;
  id: string;
  username: string;
}) {
  await pool.query(
    `INSERT INTO auth_user (
       id, name, email, "emailVerified", username, role, "approvalStatus"
     )
     VALUES ($1, $2, $3, $4, $2, 'user', $5)`,
    [
      input.id,
      input.username,
      `${input.username}@example.com`,
      input.emailVerified ?? true,
      input.approvalStatus ?? "approved"
    ]
  );
}

beforeAll(async () => {
  await adminPool.query("DROP SCHEMA IF EXISTS auth_accounts_test CASCADE");
  await adminPool.query("CREATE SCHEMA auth_accounts_test");
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
  await adminPool.query("DROP SCHEMA IF EXISTS auth_accounts_test CASCADE");
  await adminPool.end();
});

describe("creator profile provisioning", () => {
  it("creates and links one profile in an idempotent transaction", async () => {
    await insertIdentity({ id: "identity-one", username: "tiny_studio" });

    const first = await provisionCreatorProfile(pool, "identity-one");
    const second = await provisionCreatorProfile(pool, "identity-one");
    const persisted = await pool.query(
      `SELECT id, username, display_name, role, auth_user_id,
              password_hash, auth_provider, email
       FROM users WHERE auth_user_id = 'identity-one'`
    );
    const audit = await pool.query<{ action: string }>(
      `SELECT action FROM auth_account_action_audit
       WHERE target_auth_user_id = 'identity-one'`
    );

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      displayName: "tiny_studio",
      username: "tiny_studio"
    });
    expect(first?.id).toMatch(
      /^user-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
    expect(persisted.rows).toEqual([
      expect.objectContaining({
        auth_user_id: "identity-one",
        display_name: "tiny_studio",
        email: null,
        password_hash: null,
        role: "member",
        username: "tiny_studio"
      })
    ]);
    expect(audit.rows).toEqual([{ action: "profile_provisioned" }]);
  });

  it.each([
    { approvalStatus: "pending" as const, emailVerified: true },
    { approvalStatus: "rejected" as const, emailVerified: true },
    { approvalStatus: "approved" as const, emailVerified: false }
  ])("does not provision an unusable identity: %o", async (state) => {
    await insertIdentity({
      ...state,
      id: `identity-${state.approvalStatus}-${state.emailVerified}`,
      username: `user_${state.approvalStatus}_${state.emailVerified}`
    });

    await expect(
      provisionCreatorProfile(
        pool,
        `identity-${state.approvalStatus}-${state.emailVerified}`
      )
    ).resolves.toBeNull();
    expect(
      await pool.query("SELECT id FROM users")
    ).toMatchObject({ rowCount: 0 });
  });

  it("does not claim a seeded creator handle", async () => {
    await insertIdentity({ id: "identity-seed-conflict", username: "phil" });
    await pool.query(
      `INSERT INTO users (id, username, display_name, role, accent_color)
       VALUES ('user-phil', 'phil', 'phil', 'member', '#f472b6')`
    );

    await expect(
      provisionCreatorProfile(pool, "identity-seed-conflict")
    ).rejects.toMatchObject({ code: "CREATOR_HANDLE_TAKEN" });
    expect(
      await pool.query("SELECT auth_user_id FROM users WHERE id = 'user-phil'")
    ).toMatchObject({ rows: [{ auth_user_id: null }] });
  });
});

describe("admin account lifecycle", () => {
  beforeEach(async () => {
    await insertIdentity({ id: "identity-admin", username: "account_admin" });
    await pool.query(
      "UPDATE auth_user SET role = 'admin' WHERE id = 'identity-admin'"
    );
    await provisionCreatorProfile(pool, "identity-admin");
  });

  it("approves a verified pending account and provisions it once", async () => {
    await insertIdentity({
      approvalStatus: "pending",
      id: "identity-pending",
      username: "pending_creator"
    });

    const first = await approveAccount(pool, {
      actorAuthUserId: "identity-admin",
      targetAuthUserId: "identity-pending"
    });
    const repeated = await approveAccount(pool, {
      actorAuthUserId: "identity-admin",
      targetAuthUserId: "identity-pending"
    });
    const audit = await pool.query<{ action: string }>(
      `SELECT action FROM auth_account_action_audit
       WHERE target_auth_user_id = 'identity-pending'
       ORDER BY created_at, action`
    );

    expect(first).toEqual(repeated);
    expect(first).toMatchObject({
      approvalStatus: "approved",
      profile: { username: "pending_creator" }
    });
    expect(audit.rows.filter((row) => row.action === "approved")).toHaveLength(1);
    expect(
      audit.rows.filter((row) => row.action === "profile_provisioned")
    ).toHaveLength(1);
  });

  it("will not approve an unverified account", async () => {
    await insertIdentity({
      approvalStatus: "pending",
      emailVerified: false,
      id: "identity-unverified",
      username: "unverified_creator"
    });

    await expect(
      approveAccount(pool, {
        actorAuthUserId: "identity-admin",
        targetAuthUserId: "identity-unverified"
      })
    ).rejects.toMatchObject({ code: "EMAIL_NOT_VERIFIED" });
  });

  it("rejects, disables, and explicitly revokes sessions immediately", async () => {
    await insertIdentity({ id: "identity-target", username: "target_creator" });
    await provisionCreatorProfile(pool, "identity-target");
    const insertSession = (id: string) =>
      pool.query(
        `INSERT INTO auth_session (
           id, "expiresAt", token, "createdAt", "updatedAt", "userId"
         ) VALUES ($1, NOW() + INTERVAL '1 day', $1, NOW(), NOW(), 'identity-target')`,
        [id]
      );

    await insertSession("session-before-disable");
    await setAccountDisabled(pool, {
      actorAuthUserId: "identity-admin",
      disabled: true,
      targetAuthUserId: "identity-target"
    });
    expect(await pool.query("SELECT id FROM auth_session")).toMatchObject({
      rowCount: 0
    });
    await setAccountDisabled(pool, {
      actorAuthUserId: "identity-admin",
      disabled: false,
      targetAuthUserId: "identity-target"
    });
    await insertSession("session-before-revoke");
    await revokeAccountSessions(pool, {
      actorAuthUserId: "identity-admin",
      targetAuthUserId: "identity-target"
    });
    expect(await pool.query("SELECT id FROM auth_session")).toMatchObject({
      rowCount: 0
    });
    await insertSession("session-before-reject");
    await rejectAccount(pool, {
      actorAuthUserId: "identity-admin",
      targetAuthUserId: "identity-target"
    });
    const target = await pool.query<{
      approvalStatus: string;
      banned: boolean;
    }>(
      `SELECT "approvalStatus", banned FROM auth_user
       WHERE id = 'identity-target'`
    );

    expect(target.rows).toEqual([
      { approvalStatus: "rejected", banned: false }
    ]);
    expect(await pool.query("SELECT id FROM auth_session")).toMatchObject({
      rowCount: 0
    });
  });

  it("lists account metadata without credential or token fields", async () => {
    await insertIdentity({
      approvalStatus: "pending",
      id: "identity-list",
      username: "listed_creator"
    });
    await pool.query(
      `INSERT INTO auth_session (
         id, "expiresAt", token, "createdAt", "updatedAt", "userId"
       ) VALUES
         ('active-session', NOW() + INTERVAL '1 day', 'active-token', NOW(), NOW(), 'identity-list'),
         ('expired-session', NOW() - INTERVAL '1 day', 'expired-token', NOW(), NOW(), 'identity-list')`
    );

    const accounts = await listAccounts(pool, "pending");

    expect(accounts).toEqual([
      expect.objectContaining({
        approvalStatus: "pending",
        disabled: false,
        email: "listed_creator@example.com",
        profile: null,
        sessionCount: 1,
        username: "listed_creator"
      })
    ]);
    expect(JSON.stringify(accounts)).not.toContain("password");
    expect(JSON.stringify(accounts)).not.toContain("token");
  });
});
