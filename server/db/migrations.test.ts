// @vitest-environment node
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { areMigrationsCurrent, runMigrations } from "./migrations";

const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  "postgresql://chatsim_dev:chatsim_dev@127.0.0.1:54339/chatsim_test";

const adminPool = new Pool({ connectionString: testDatabaseUrl });
const pool = new Pool({
  connectionString: testDatabaseUrl,
  options: "-c search_path=migrations_test"
});

beforeAll(async () => {
  await adminPool.query("DROP SCHEMA IF EXISTS migrations_test CASCADE");
  await adminPool.query("CREATE SCHEMA migrations_test");
});

afterAll(async () => {
  await pool.end();
  await adminPool.query("DROP SCHEMA IF EXISTS migrations_test CASCADE");
  await adminPool.end();
});

describe("database migrations", () => {
  it("creates the production data model with JSONB storyboards", async () => {
    await runMigrations(pool);

    const tables = await pool.query<{ table_name: string }>(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'migrations_test'
       ORDER BY table_name`
    );
    const stories = await pool.query<{
      column_name: string;
      data_type: string;
      is_nullable: "YES" | "NO";
    }>(
      `SELECT column_name, data_type, is_nullable
       FROM information_schema.columns
       WHERE table_schema = 'migrations_test' AND table_name = 'stories'
       ORDER BY ordinal_position`
    );
    const users = await pool.query<{
      column_name: string;
      is_nullable: "YES" | "NO";
    }>(
      `SELECT column_name, is_nullable
       FROM information_schema.columns
       WHERE table_schema = 'migrations_test' AND table_name = 'users'`
    );
    const imageStatusConstraint = await pool.query<{ definition: string }>(
      `SELECT pg_get_constraintdef(c.oid) AS definition
       FROM pg_constraint c
       JOIN pg_class t ON t.oid = c.conrelid
       JOIN pg_namespace n ON n.oid = t.relnamespace
       WHERE n.nspname = 'migrations_test'
         AND t.relname = 'images'
         AND c.conname = 'images_status_check'`
    );
    const bioColumn = await pool.query<{
      column_name: string;
      data_type: string;
      is_nullable: "YES" | "NO";
    }>(
      `SELECT column_name, data_type, is_nullable
       FROM information_schema.columns
       WHERE table_schema = 'migrations_test'
         AND table_name = 'users'
         AND column_name = 'bio'`
    );
    const usersBioConstraint = await pool.query<{ definition: string }>(
      `SELECT pg_get_constraintdef(c.oid) AS definition
       FROM pg_constraint c
       JOIN pg_class t ON t.oid = c.conrelid
       JOIN pg_namespace n ON n.oid = t.relnamespace
       WHERE n.nspname = 'migrations_test'
         AND t.relname = 'users'
         AND c.conname = 'users_bio_check'`
    );
    const authUserColumns = await pool.query<{
      column_name: string;
      data_type: string;
      is_nullable: "YES" | "NO";
    }>(
      `SELECT column_name, data_type, is_nullable
       FROM information_schema.columns
       WHERE table_schema = 'migrations_test' AND table_name = 'auth_user'
       ORDER BY ordinal_position`
    );
    const authConstraints = await pool.query<{
      constraint_name: string;
      definition: string;
    }>(
      `SELECT c.conname AS constraint_name, pg_get_constraintdef(c.oid) AS definition
       FROM pg_constraint c
       JOIN pg_class t ON t.oid = c.conrelid
       JOIN pg_namespace n ON n.oid = t.relnamespace
       WHERE n.nspname = 'migrations_test' AND t.relname = 'auth_user'
       ORDER BY c.conname`
    );
    const authUserLink = await pool.query<{
      column_name: string;
      is_nullable: "YES" | "NO";
    }>(
      `SELECT column_name, is_nullable
       FROM information_schema.columns
       WHERE table_schema = 'migrations_test'
         AND table_name = 'users'
         AND column_name = 'auth_user_id'`
    );
    const authUserLinkIndexes = await pool.query<{ indexdef: string }>(
      `SELECT indexdef
       FROM pg_indexes
       WHERE schemaname = 'migrations_test'
         AND tablename = 'users'
         AND indexname = 'users_auth_user_id_uidx'`
    );

    expect(tables.rows.map((row) => row.table_name)).toEqual([
      "auth_abuse_limit",
      "auth_account",
      "auth_account_action_audit",
      "auth_rate_limit",
      "auth_session",
      "auth_user",
      "auth_verification",
      "images",
      "schema_migrations",
      "sessions",
      "stories",
      "upload_audit_log",
      "users"
    ]);
    expect(stories.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          column_name: "storyboard",
          data_type: "jsonb",
          is_nullable: "NO"
        }),
        expect.objectContaining({
          column_name: "cover_image_id",
          is_nullable: "YES"
        })
      ])
    );
    expect(users.rows).toEqual(
      expect.arrayContaining([
        {
          column_name: "auth_provider",
          is_nullable: "YES"
        },
        {
          column_name: "password_hash",
          is_nullable: "YES"
        },
        {
          column_name: "password_salt",
          is_nullable: "YES"
        },
        {
          column_name: "provider_subject",
          is_nullable: "YES"
        },
        {
          column_name: "updated_at",
          is_nullable: "NO"
        }
      ])
    );
    expect(imageStatusConstraint.rows[0].definition).toContain("processing");
    expect(imageStatusConstraint.rows[0].definition).toContain("deleting");
    expect(bioColumn.rows).toEqual([
      {
        column_name: "bio",
        data_type: "text",
        is_nullable: "YES"
      }
    ]);
    expect(usersBioConstraint.rows).toHaveLength(1);
    expect(usersBioConstraint.rows[0].definition).toContain("160");
    expect(authUserColumns.rows).toEqual(
      expect.arrayContaining([
        { column_name: "id", data_type: "text", is_nullable: "NO" },
        { column_name: "email", data_type: "text", is_nullable: "NO" },
        {
          column_name: "emailVerified",
          data_type: "boolean",
          is_nullable: "NO"
        },
        { column_name: "username", data_type: "text", is_nullable: "NO" },
        { column_name: "role", data_type: "text", is_nullable: "NO" },
        {
          column_name: "approvalStatus",
          data_type: "text",
          is_nullable: "NO"
        }
      ])
    );
    expect(authConstraints.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          constraint_name: "auth_user_username_check",
          definition: expect.stringContaining("[a-z0-9_-]{3,32}")
        }),
        expect.objectContaining({
          constraint_name: "auth_user_role_check",
          definition: expect.stringContaining("admin")
        }),
        expect.objectContaining({
          constraint_name: "auth_user_approval_status_check",
          definition: expect.stringContaining("rejected")
        })
      ])
    );
    expect(authUserLink.rows).toEqual([
      { column_name: "auth_user_id", is_nullable: "YES" }
    ]);
    expect(authUserLinkIndexes.rows).toHaveLength(1);
    expect(authUserLinkIndexes.rows[0].indexdef).toContain("UNIQUE");
  });

  it("is idempotent and records each migration once", async () => {
    await runMigrations(pool);
    await runMigrations(pool);

    const result = await pool.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM schema_migrations"
    );

    expect(result.rows).toEqual([{ count: "8" }]);
    expect(await areMigrationsCurrent(pool)).toBe(true);
  });

  it("treats LF and CRLF migration checksums as equivalent", async () => {
    const lfChecksum =
      "71e10c09d9bb83fb7d3ffa25183536dda2baceecef73a4b922d89598fb3dbe6e";
    const crlfChecksum =
      "bcccb1cd05aaf184ae37af67cdae1743566f901d93d3a104ee35f415befa4117";

    await pool.query(
      "UPDATE schema_migrations SET checksum = $1 WHERE name = '007_user_bio.sql'",
      [lfChecksum]
    );
    expect(await areMigrationsCurrent(pool)).toBe(true);
    await expect(runMigrations(pool)).resolves.toBeUndefined();

    await pool.query(
      "UPDATE schema_migrations SET checksum = $1 WHERE name = '007_user_bio.sql'",
      [crlfChecksum]
    );
    expect(await areMigrationsCurrent(pool)).toBe(true);
    await expect(runMigrations(pool)).resolves.toBeUndefined();

    const canonical = await pool.query<{ checksum: string }>(
      "SELECT checksum FROM schema_migrations WHERE name = '007_user_bio.sql'"
    );
    expect(canonical.rows).toEqual([{ checksum: lfChecksum }]);
  });

  it("detects an edited migration through its stored checksum", async () => {
    const original = await pool.query<{ checksum: string }>(
      "SELECT checksum FROM schema_migrations WHERE name = '001_initial.sql'"
    );
    await pool.query(
      "UPDATE schema_migrations SET checksum = 'changed' WHERE name = '001_initial.sql'"
    );

    expect(await areMigrationsCurrent(pool)).toBe(false);

    await pool.query(
      "UPDATE schema_migrations SET checksum = $1 WHERE name = '001_initial.sql'",
      [original.rows[0].checksum]
    );
  });

  it("reports a schema that has not applied every migration as unready", async () => {
    await pool.query(
      "DELETE FROM schema_migrations WHERE name = '001_initial.sql'"
    );

    expect(await areMigrationsCurrent(pool)).toBe(false);
  });
});
