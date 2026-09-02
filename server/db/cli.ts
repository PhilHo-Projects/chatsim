import { runMigrations } from "./migrations";
import { createDatabasePool } from "./pool";
import { StoryStore } from "../storyStore";
import { bootstrapBetterAuthAdmin } from "../auth/bootstrap";
import { readAuthRuntimeConfig } from "../auth/config";

const LOCAL_DATABASE_URL =
  "postgresql://chatsim_dev:chatsim_dev@127.0.0.1:54339/chatsim_dev";

async function main() {
  const command = process.argv[2];
  const databaseUrl = process.env.DATABASE_URL ?? LOCAL_DATABASE_URL;

  if (command === "migrate") {
    const pool = createDatabasePool(databaseUrl);

    try {
      await runMigrations(pool);
    } finally {
      await pool.end();
    }

    return;
  }

  const pool = createDatabasePool(databaseUrl);
  const store = await StoryStore.open({
    cleanupLegacySessions: false,
    pool,
    startCleanup: false
  });

  try {
    if (command === "seed") {
      await store.seed();
      return;
    }

    if (command === "bootstrap-admin") {
      const username = process.env.ADMIN_BOOTSTRAP_USERNAME?.trim();
      const password = process.env.ADMIN_BOOTSTRAP_PASSWORD;

      if (!username || !password) {
        throw new Error(
          "ADMIN_BOOTSTRAP_USERNAME and ADMIN_BOOTSTRAP_PASSWORD are required."
        );
      }

      const authConfig = readAuthRuntimeConfig();
      await bootstrapBetterAuthAdmin(pool, {
        email: authConfig.adminBootstrapEmail,
        password,
        username
      });
      return;
    }

    throw new Error(
      "Expected one of: migrate, seed, bootstrap-admin."
    );
  } finally {
    await store.close();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Database command failed.";
  console.error(message);
  process.exitCode = 1;
});
