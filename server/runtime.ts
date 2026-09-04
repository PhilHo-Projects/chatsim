import type { Pool } from "pg";
import { Resend } from "resend";
import { getCurrentAccountWithHeaders } from "./auth/accountContext";
import {
  buildChatsimAuth,
  createChatsimAuthWebHandler
} from "./auth/betterAuth";
import {
  readAuthRuntimeConfig,
  type AuthRuntimeConfig
} from "./auth/config";
import {
  InMemoryEmailSender,
  ResendEmailSender,
  type TransactionalEmailSender
} from "./auth/email";
import { runMigrations } from "./db/migrations";
import { createDatabasePool } from "./db/pool";
import {
  createMediaServiceFromEnvironment,
  type MediaService
} from "./mediaService";
import { StoryStore } from "./storyStore";

type ApplicationRuntimeOptions = {
  authConfig?: AuthRuntimeConfig;
  media?: MediaService | null;
  pool?: Pool;
  sender?: TransactionalEmailSender;
  startCleanup?: boolean;
};

export async function createApplicationRuntime(
  options: ApplicationRuntimeOptions = {}
) {
  const ownsPool = !options.pool;
  const pool = options.pool ?? createDatabasePool();

  try {
    const authConfig = options.authConfig ?? readAuthRuntimeConfig();
    await runMigrations(pool);
    const store = await StoryStore.open({
      cleanupLegacySessions: false,
      pool,
      runMigrations: false,
      startCleanup: options.startCleanup
    });
    const sender =
      options.sender ??
      (authConfig.resendApiKey
        ? new ResendEmailSender(
            new Resend(authConfig.resendApiKey),
            authConfig.emailFrom
          )
        : new InMemoryEmailSender());
    const auth = buildChatsimAuth({ config: authConfig, pool, sender });
    const authWebHandler = createChatsimAuthWebHandler({
      auth,
      config: authConfig,
      pool
    });
    const media =
      options.media !== undefined
        ? options.media
        : process.env.R2_PUBLIC_BASE_URL?.trim()
          ? createMediaServiceFromEnvironment(pool)
          : null;

    return {
      auth,
      authConfig,
      authWebHandler,
      media,
      pool,
      sender,
      store,
      async close() {
        media?.close();
        await store.close();

        if (ownsPool) {
          await pool.end();
        }
      },
      async currentAccount(
        headers: Headers,
        options?: { disableRefresh?: boolean }
      ) {
        return getCurrentAccountWithHeaders({
          auth,
          config: authConfig,
          disableRefresh: options?.disableRefresh,
          headers,
          pool
        });
      },
      async healthCheck() {
        return {
          auth: "ok" as const,
          database: (await store.healthCheck())
            ? ("ok" as const)
            : ("unavailable" as const)
        };
      }
    };
  } catch (error) {
    if (ownsPool) {
      await pool.end().catch(() => undefined);
    }

    throw error;
  }
}

export type ApplicationRuntime = Awaited<
  ReturnType<typeof createApplicationRuntime>
>;
