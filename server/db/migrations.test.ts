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

    expect(tables.rows.map((row) => row.table_name)).toEqual([
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
  });

  it("is idempotent and records each migration once", async () => {
    await runMigrations(pool);
    await runMigrations(pool);

    const result = await pool.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM schema_migrations"
    );

    expect(result.rows).toEqual([{ count: "7" }]);
    expect(await areMigrationsCurrent(pool)).toBe(true);
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
