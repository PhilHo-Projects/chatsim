import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";

export type CreatorProfile = {
  accentColor: string;
  bio: string | null;
  displayName: string;
  id: string;
  username: string;
};

type IdentityRow = {
  approvalStatus: "approved" | "pending" | "rejected";
  emailVerified: boolean;
  id: string;
  username: string;
};

type ProfileRow = {
  accent_color: string;
  bio: string | null;
  display_name: string;
  id: string;
  username: string;
};

export class CreatorProfileProvisioningError extends Error {
  readonly code: "CREATOR_HANDLE_TAKEN";

  constructor() {
    super("That creator handle is already in use.");
    this.code = "CREATOR_HANDLE_TAKEN";
    this.name = "CreatorProfileProvisioningError";
  }
}

export class AccountLifecycleError extends Error {
  readonly code: "ACCOUNT_ACTION_NOT_ALLOWED" | "EMAIL_NOT_VERIFIED" | "NOT_FOUND";

  constructor(
    code: AccountLifecycleError["code"],
    message: string
  ) {
    super(message);
    this.code = code;
    this.name = "AccountLifecycleError";
  }
}

function toCreatorProfile(row: ProfileRow): CreatorProfile {
  return {
    accentColor: row.accent_color,
    bio: row.bio,
    displayName: row.display_name,
    id: row.id,
    username: row.username
  };
}

async function findLinkedProfile(client: PoolClient, authUserId: string) {
  const result = await client.query<ProfileRow>(
    `SELECT id, username, display_name, accent_color, bio
     FROM users WHERE auth_user_id = $1`,
    [authUserId]
  );

  return result.rows[0] ? toCreatorProfile(result.rows[0]) : null;
}

async function provisionCreatorProfileWithClient(
  client: PoolClient,
  authUserId: string
): Promise<CreatorProfile | null> {
  const identityResult = await client.query<IdentityRow>(
      `SELECT id, username, "emailVerified", "approvalStatus"
       FROM auth_user WHERE id = $1 FOR UPDATE`,
      [authUserId]
    );
    const identity = identityResult.rows[0];

    if (!identity) {
      throw new Error("Auth identity does not exist.");
    }

    const linked = await findLinkedProfile(client, authUserId);

    if (linked) {
      return linked;
    }

    if (
      !identity.emailVerified ||
      identity.approvalStatus !== "approved"
    ) {
      return null;
    }

    const handleOwner = await client.query<{ auth_user_id: string | null }>(
      "SELECT auth_user_id FROM users WHERE username = $1 FOR UPDATE",
      [identity.username]
    );

    if (handleOwner.rows[0]?.auth_user_id !== undefined) {
      throw new CreatorProfileProvisioningError();
    }

    const profileId = `user-${randomUUID()}`;
    let inserted: ProfileRow;

    try {
      const insertedResult = await client.query<ProfileRow>(
        `INSERT INTO users (
           id, username, display_name, role, accent_color, auth_user_id
         )
         VALUES ($1, $2, $2, 'member', '#8b5cf6', $3)
         RETURNING id, username, display_name, accent_color, bio`,
        [profileId, identity.username, authUserId]
      );
      inserted = insertedResult.rows[0];
    } catch (error: unknown) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "23505"
      ) {
        throw new CreatorProfileProvisioningError();
      }

      throw error;
    }

    await client.query(
      `INSERT INTO auth_account_action_audit (
         id, target_auth_user_id, action
       ) VALUES ($1, $2, 'profile_provisioned')`,
      [randomUUID(), authUserId]
    );
    return toCreatorProfile(inserted);
}

export async function provisionCreatorProfile(
  pool: Pool,
  authUserId: string
): Promise<CreatorProfile | null> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const profile = await provisionCreatorProfileWithClient(client, authUserId);
    await client.query("COMMIT");
    return profile;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function getCreatorProfile(
  pool: Pool,
  authUserId: string
): Promise<CreatorProfile | null> {
  const result = await pool.query<ProfileRow>(
    `SELECT id, username, display_name, accent_color, bio
     FROM users WHERE auth_user_id = $1`,
    [authUserId]
  );

  return result.rows[0] ? toCreatorProfile(result.rows[0]) : null;
}

type AccountActionInput = {
  actorAuthUserId: string;
  targetAuthUserId: string;
};

type ManagedIdentityRow = IdentityRow & {
  banned: boolean;
  createdAt: Date;
  email: string;
  role: "admin" | "user";
};

async function lockManagedIdentity(
  client: PoolClient,
  targetAuthUserId: string
) {
  const result = await client.query<ManagedIdentityRow>(
    `SELECT id, username, email, "emailVerified", "approvalStatus", role,
            banned, "createdAt"
     FROM auth_user WHERE id = $1 FOR UPDATE`,
    [targetAuthUserId]
  );

  if (!result.rows[0]) {
    throw new AccountLifecycleError("NOT_FOUND", "Account not found.");
  }

  return result.rows[0];
}

async function writeAccountAction(
  client: PoolClient,
  action: "approved" | "disabled" | "enabled" | "rejected" | "sessions_revoked",
  input: AccountActionInput
) {
  await client.query(
    `INSERT INTO auth_account_action_audit (
       id, actor_auth_user_id, target_auth_user_id, action
     ) VALUES ($1, $2, $3, $4)`,
    [randomUUID(), input.actorAuthUserId, input.targetAuthUserId, action]
  );
}

export async function approveAccount(pool: Pool, input: AccountActionInput) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const identity = await lockManagedIdentity(client, input.targetAuthUserId);

    if (!identity.emailVerified) {
      throw new AccountLifecycleError(
        "EMAIL_NOT_VERIFIED",
        "The account must verify its email before approval."
      );
    }

    const changed = identity.approvalStatus !== "approved";

    if (changed) {
      await client.query(
        `UPDATE auth_user
         SET "approvalStatus" = 'approved', banned = FALSE, "banReason" = NULL,
             "banExpires" = NULL, "updatedAt" = NOW()
         WHERE id = $1`,
        [input.targetAuthUserId]
      );
    }

    const profile = await provisionCreatorProfileWithClient(
      client,
      input.targetAuthUserId
    );

    if (changed) {
      await writeAccountAction(client, "approved", input);
    }

    await client.query("COMMIT");
    return {
      approvalStatus: "approved" as const,
      authUserId: identity.id,
      email: identity.email,
      profile
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function rejectAccount(pool: Pool, input: AccountActionInput) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const identity = await lockManagedIdentity(client, input.targetAuthUserId);

    if (identity.role === "admin") {
      throw new AccountLifecycleError(
        "ACCOUNT_ACTION_NOT_ALLOWED",
        "The bootstrap admin cannot be rejected."
      );
    }

    await client.query(
      `UPDATE auth_user
       SET "approvalStatus" = 'rejected', "updatedAt" = NOW()
       WHERE id = $1`,
      [input.targetAuthUserId]
    );
    await client.query("DELETE FROM auth_session WHERE \"userId\" = $1", [
      input.targetAuthUserId
    ]);
    await writeAccountAction(client, "rejected", input);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function setAccountDisabled(
  pool: Pool,
  input: AccountActionInput & { disabled: boolean }
) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const identity = await lockManagedIdentity(client, input.targetAuthUserId);

    if (identity.role === "admin") {
      throw new AccountLifecycleError(
        "ACCOUNT_ACTION_NOT_ALLOWED",
        "The bootstrap admin cannot be disabled."
      );
    }

    await client.query(
      `UPDATE auth_user
       SET banned = $1,
           "banReason" = CASE WHEN $1 THEN 'Disabled by a Chatsim admin' ELSE NULL END,
           "banExpires" = NULL,
           "updatedAt" = NOW()
       WHERE id = $2`,
      [input.disabled, input.targetAuthUserId]
    );

    if (input.disabled) {
      await client.query("DELETE FROM auth_session WHERE \"userId\" = $1", [
        input.targetAuthUserId
      ]);
    }

    await writeAccountAction(
      client,
      input.disabled ? "disabled" : "enabled",
      input
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function revokeAccountSessions(
  pool: Pool,
  input: AccountActionInput
) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await lockManagedIdentity(client, input.targetAuthUserId);
    await client.query("DELETE FROM auth_session WHERE \"userId\" = $1", [
      input.targetAuthUserId
    ]);
    await writeAccountAction(client, "sessions_revoked", input);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function listAccounts(
  pool: Pool,
  status?: "approved" | "pending" | "rejected"
) {
  const values: string[] = [];
  const where = status
    ? `WHERE i."approvalStatus" = $${values.push(status)}`
    : "";
  const result = await pool.query<
    ManagedIdentityRow & {
      accent_color: string | null;
      bio: string | null;
      display_name: string | null;
      profile_id: string | null;
      profile_username: string | null;
      session_count: string;
    }
  >(
    `SELECT i.id, i.email, i."emailVerified", i.username, i.role, i.banned,
            i."approvalStatus", i."createdAt", p.id AS profile_id,
            p.username AS profile_username, p.display_name, p.accent_color,
            p.bio, COUNT(s.id)::text AS session_count
     FROM auth_user i
     LEFT JOIN users p ON p.auth_user_id = i.id
     LEFT JOIN auth_session s
       ON s."userId" = i.id AND s."expiresAt" > NOW()
     ${where}
     GROUP BY i.id, p.id
     ORDER BY CASE i."approvalStatus"
                WHEN 'pending' THEN 0
                WHEN 'approved' THEN 1
                ELSE 2
              END,
              i."createdAt", i.id`,
    values
  );

  return result.rows.map((row) => ({
    approvalStatus: row.approvalStatus,
    createdAt: row.createdAt.toISOString(),
    disabled: row.banned,
    email: row.email,
    emailVerified: row.emailVerified,
    id: row.id,
    profile: row.profile_id
      ? {
          accentColor: row.accent_color as string,
          bio: row.bio,
          displayName: row.display_name as string,
          id: row.profile_id,
          username: row.profile_username as string
        }
      : null,
    role: row.role,
    sessionCount: Number(row.session_count),
    username: row.username
  }));
}
