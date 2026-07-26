import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Pool } from "pg";

const MIGRATION_LOCK_KEY = "chatsim_schema_migrations";
const migrationsDirectory = join(
  dirname(fileURLToPath(import.meta.url)),
  "migrations"
);

async function listMigrationNames() {
  return (await readdir(migrationsDirectory))
    .filter((name) => /^\d+_.+\.sql$/.test(name))
    .sort();
}

async function loadMigrations() {
  const migrations = [];

  for (const name of await listMigrationNames()) {
    const sql = await readFile(join(migrationsDirectory, name), "utf8");
    migrations.push({
      checksum: createHash("sha256").update(sql).digest("hex"),
      name,
      sql
    });
  }

  return migrations;
}

export async function areMigrationsCurrent(pool: Pool) {
  try {
    const expected = await loadMigrations();
    const appliedResult = await pool.query<{
      checksum: string | null;
      name: string;
    }>(
      "SELECT name, checksum FROM schema_migrations ORDER BY name"
    );

    return (
      appliedResult.rows.length === expected.length &&
      appliedResult.rows.every(
        (row, index) =>
          row.name === expected[index].name &&
          row.checksum === expected[index].checksum
      )
    );
  } catch {
    return false;
  }
}

export async function runMigrations(pool: Pool) {
  const client = await pool.connect();

  try {
    await client.query(
      "SELECT pg_advisory_lock(hashtext($1))",
      [MIGRATION_LOCK_KEY]
    );
    await client.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         name TEXT PRIMARY KEY,
         checksum TEXT,
         applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
       )`
    );

    const appliedResult = await client.query<{ name: string }>(
      "SELECT name FROM schema_migrations"
    );
    const applied = new Set(appliedResult.rows.map((row) => row.name));
    const migrations = await loadMigrations();
    const existingChecksums = await client
      .query<{ checksum: string | null; name: string }>(
        "SELECT name, checksum FROM schema_migrations"
      )
      .catch((error: unknown) => {
        if (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "42703"
        ) {
          return { rows: [] };
        }

        throw error;
      });
    const expectedByName = new Map(
      migrations.map((migration) => [migration.name, migration.checksum])
    );

    for (const row of existingChecksums.rows) {
      if (
        row.checksum &&
        row.checksum !== expectedByName.get(row.name)
      ) {
        throw new Error(`Applied migration ${row.name} has changed.`);
      }
    }

    for (const migration of migrations) {
      if (applied.has(migration.name)) {
        continue;
      }

      await client.query("BEGIN");

      try {
        await client.query(migration.sql);
        await client.query(
          `INSERT INTO schema_migrations (name, checksum)
           VALUES ($1, $2)`,
          [migration.name, migration.checksum]
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }

    for (const migration of migrations) {
      await client.query(
        `UPDATE schema_migrations
         SET checksum = $1
         WHERE name = $2 AND checksum IS NULL`,
        [migration.checksum, migration.name]
      );
    }
  } finally {
    await client
      .query("SELECT pg_advisory_unlock(hashtext($1))", [MIGRATION_LOCK_KEY])
      .catch(() => undefined);
    client.release();
  }
}
