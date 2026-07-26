import { readdir, readFile } from "node:fs/promises";
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

export async function areMigrationsCurrent(pool: Pool) {
  try {
    const expected = await listMigrationNames();
    const appliedResult = await pool.query<{ name: string }>(
      "SELECT name FROM schema_migrations ORDER BY name"
    );

    return (
      appliedResult.rows.length === expected.length &&
      appliedResult.rows.every((row, index) => row.name === expected[index])
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
         applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
       )`
    );

    const appliedResult = await client.query<{ name: string }>(
      "SELECT name FROM schema_migrations"
    );
    const applied = new Set(appliedResult.rows.map((row) => row.name));
    const migrations = await listMigrationNames();

    for (const name of migrations) {
      if (applied.has(name)) {
        continue;
      }

      const sql = await readFile(join(migrationsDirectory, name), "utf8");

      await client.query("BEGIN");

      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO schema_migrations (name) VALUES ($1)",
          [name]
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    await client
      .query("SELECT pg_advisory_unlock(hashtext($1))", [MIGRATION_LOCK_KEY])
      .catch(() => undefined);
    client.release();
  }
}
