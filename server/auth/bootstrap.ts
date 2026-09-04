import { randomUUID } from "node:crypto";
import { createLocalAccountIssuer } from "better-auth/db";
import { hashPassword } from "better-auth/crypto";
import type { Pool } from "pg";

const BOOTSTRAP_LOCK = "chatsim_better_auth_admin_bootstrap";
const COMMON_PASSWORDS = new Set([
  "0000",
  "123456789012",
  "letmeinletmein",
  "password",
  "password123",
  "qwertyqwerty"
]);

function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}

function validateInput(input: {
  email: string;
  password: string;
  username: string;
}) {
  const email = input.email.trim().toLowerCase();
  const username = normalizeUsername(input.username);

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Admin bootstrap email is invalid.");
  }

  if (!/^[a-z0-9_-]{3,32}$/.test(username)) {
    throw new Error("Admin bootstrap username is invalid.");
  }

  if (
    input.password.length < 12 ||
    input.password.length > 128 ||
    COMMON_PASSWORDS.has(input.password.toLowerCase())
  ) {
    throw new Error("Admin bootstrap password does not meet the password policy.");
  }

  return { email, username };
}

export async function bootstrapBetterAuthAdmin(
  pool: Pool,
  input: { email: string; password: string; username: string }
) {
  const normalized = validateInput(input);
  const passwordHash = await hashPassword(input.password);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      BOOTSTRAP_LOCK
    ]);
    let profile = await client.query<{
      auth_user_id: string | null;
      username: string;
    }>(
      `SELECT username, auth_user_id
       FROM users WHERE id = 'user-admin' FOR UPDATE`
    );

    if (!profile.rows[0]) {
      await client.query(
        `INSERT INTO users (
           id, username, display_name, role, accent_color
         ) VALUES (
           'user-admin', $1, $1, 'admin', '#8b5cf6'
         )`,
        [normalized.username]
      );
      profile = {
        rows: [{ auth_user_id: null, username: normalized.username }]
      } as typeof profile;
    }

    if (profile.rows[0].auth_user_id) {
      await client.query("COMMIT");
      return { authUserId: profile.rows[0].auth_user_id };
    }

    const username = profile.rows[0].username;
    const existingIdentity = await client.query<{ id: string }>(
      `SELECT id FROM auth_user
       WHERE email = $1 OR username = $2
       FOR UPDATE`,
      [normalized.email, username]
    );

    if (existingIdentity.rows[0]) {
      throw new Error(
        "The bootstrap email or username already belongs to an unlinked identity."
      );
    }

    const authUserId = randomUUID();
    await client.query(
      `INSERT INTO auth_user (
         id, name, email, "emailVerified", username, role, banned,
         "approvalStatus"
       ) VALUES ($1, $2, $3, TRUE, $2, 'admin', FALSE, 'approved')`,
      [authUserId, username, normalized.email]
    );

    const credential = await client.query(
      `SELECT id FROM auth_account
       WHERE "userId" = $1 AND "providerId" = 'credential'
       FOR UPDATE`,
      [authUserId]
    );

    if (!credential.rows[0]) {
      await client.query(
        `INSERT INTO auth_account (
           id, issuer, "accountId", "providerId", "userId", password,
           "createdAt", "updatedAt"
         ) VALUES ($1, $2, $3, 'credential', $3, $4, NOW(), NOW())`,
        [
          randomUUID(),
          createLocalAccountIssuer("credential"),
          authUserId,
          passwordHash
        ]
      );
    }

    await client.query(
      `UPDATE users
       SET auth_user_id = $1, updated_at = NOW()
       WHERE id = 'user-admin'`,
      [authUserId]
    );
    await client.query("DELETE FROM auth_session WHERE \"userId\" = $1", [
      authUserId
    ]);
    await client.query(
      `INSERT INTO auth_account_action_audit (
         id, target_auth_user_id, action
       ) VALUES ($1, $2, 'admin_bootstrapped')`,
      [randomUUID(), authUserId]
    );
    await client.query("COMMIT");
    return { authUserId };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
