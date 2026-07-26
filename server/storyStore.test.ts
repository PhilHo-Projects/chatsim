// @vitest-environment node
import { createHash } from "node:crypto";
import { Pool } from "pg";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it
} from "vitest";
import { runMigrations } from "./db/migrations";
import { StoryStore } from "./storyStore";

const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  "postgresql://chatsim_dev:chatsim_dev@127.0.0.1:54339/chatsim_test";
const adminPool = new Pool({ connectionString: testDatabaseUrl });
const pool = new Pool({
  connectionString: testDatabaseUrl,
  options: "-c search_path=story_store_test"
});

let now = new Date("2026-07-25T12:00:00.000Z");
let store: StoryStore;

function createClientQueryGate(
  basePool: Pool,
  matches: (query: string) => boolean
) {
  let releaseQuery: () => void = () => undefined;
  let signalQueryReached: () => void = () => undefined;
  let hasBlocked = false;
  const queryReached = new Promise<void>((resolve) => {
    signalQueryReached = resolve;
  });
  const queryReleased = new Promise<void>((resolve) => {
    releaseQuery = resolve;
  });
  const gatedPool = new Proxy(basePool, {
    get(target, property) {
      if (property === "connect") {
        return async () => {
          const client = await target.connect();

          return new Proxy(client, {
            get(clientTarget, clientProperty) {
              const value = Reflect.get(
                clientTarget,
                clientProperty,
                clientTarget
              );

              if (clientProperty !== "query") {
                return typeof value === "function"
                  ? value.bind(clientTarget)
                  : value;
              }

              return async (...args: unknown[]) => {
                const query = typeof args[0] === "string" ? args[0] : "";

                if (!hasBlocked && matches(query)) {
                  hasBlocked = true;
                  signalQueryReached();
                  await queryReleased;
                }

                return (
                  clientTarget.query.bind(clientTarget) as (
                    ...queryArgs: unknown[]
                  ) => Promise<unknown>
                )(...args);
              };
            }
          });
        };
      }

      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    }
  });

  return {
    pool: gatedPool as Pool,
    queryReached,
    releaseQuery
  };
}

async function waitForFinishedOrLock(
  hasFinished: () => boolean,
  queryNeedle: string
) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (hasFinished()) {
      return;
    }

    const blocked = await pool.query(
      `SELECT 1
       FROM pg_stat_activity
       WHERE pid <> pg_backend_pid()
         AND datname = current_database()
         AND wait_event_type = 'Lock'
         AND POSITION($1 IN query) > 0
       LIMIT 1`,
      [queryNeedle]
    );

    if (blocked.rowCount === 1) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  throw new Error(`Timed out waiting for ${queryNeedle} to finish or block.`);
}

beforeAll(async () => {
  await adminPool.query("DROP SCHEMA IF EXISTS story_store_test CASCADE");
  await adminPool.query("CREATE SCHEMA story_store_test");
  await runMigrations(pool);
});

beforeEach(async () => {
  await pool.query(
    `TRUNCATE upload_audit_log, stories, sessions, images, users
     RESTART IDENTITY CASCADE`
  );
  now = new Date("2026-07-25T12:00:00.000Z");
  store = await StoryStore.open({
    pool,
    publicMediaBaseUrl: "https://media.chatsim.philippeho.dev",
    runMigrations: false,
    startCleanup: false,
    now: () => now
  });
  await store.seed();
});

afterAll(async () => {
  await pool.end();
  await adminPool.query("DROP SCHEMA IF EXISTS story_store_test CASCADE");
  await adminPool.end();
});

describe("Postgres StoryStore", () => {
  it("idempotently seeds credential-free public owners and stories", async () => {
    await pool.query(
      "UPDATE users SET display_name = 'drifted' WHERE id = 'user-phil'"
    );
    await pool.query(
      "UPDATE stories SET title = 'drifted' WHERE id = 'story-phil-1'"
    );
    await store.seed();

    const users = await pool.query<{
      password_hash: string | null;
      password_salt: string | null;
    }>("SELECT password_hash, password_salt FROM users ORDER BY id");
    const stories = await pool.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM stories"
    );
    const profiles = await store.getPublicProfiles();

    expect(users.rows).toHaveLength(25);
    expect(
      users.rows.every(
        (user) => user.password_hash === null && user.password_salt === null
      )
    ).toBe(true);
    expect(stories.rows).toEqual([{ count: "26" }]);
    expect(profiles).toHaveLength(25);
    expect(
      profiles.find((profile) => profile.id === "user-phil")?.displayName
    ).toBe("phil's stories");
    expect(
      profiles.find((profile) => profile.id === "user-phil")?.stories
    ).toEqual([
      expect.objectContaining({
        storyId: "story-phil-1",
        title: "Ketamine prison"
      }),
      expect.objectContaining({
        presentationMode: "battle",
        storyId: "story-phil-battle",
        title: "Battle"
      })
    ]);
  });

  it("registers password users and stores only password/session hashes", async () => {
    const started = await store.register({
      displayName: "Tiny Studio",
      password: "cloud-room-2026",
      username: "tiny"
    });
    const persistedUser = await pool.query<{
      password_hash: string;
      password_salt: string;
    }>(
      `SELECT password_hash, password_salt
       FROM users
       WHERE username = 'tiny'`
    );
    const persistedSession = await pool.query<{ token_hash: Buffer }>(
      "SELECT token_hash FROM sessions"
    );

    expect(started.user).toMatchObject({
      displayName: "Tiny Studio",
      role: "member",
      username: "tiny"
    });
    expect(started.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(started.expiresAt).toBe("2026-08-24T12:00:00.000Z");
    expect(persistedUser.rows[0].password_hash).not.toContain(
      "cloud-room-2026"
    );
    expect(persistedUser.rows[0].password_salt).not.toHaveLength(0);
    expect(persistedSession.rows[0].token_hash).toEqual(
      createHash("sha256").update(started.token).digest()
    );
    expect(JSON.stringify(persistedSession.rows)).not.toContain(started.token);
  });

  it("rejects weak passwords and does not give seeded owners password access", async () => {
    await expect(
      store.register({
        displayName: "Weak",
        password: "password",
        username: "weak"
      })
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      store.login({ password: "0000", username: "phil" })
    ).rejects.toMatchObject({
      statusCode: 401
    });
  });

  it("expires sessions and throttles last-seen writes", async () => {
    const started = await store.register({
      displayName: "Clock",
      password: "clock-password-2026",
      username: "clock"
    });
    const initial = await store.getSession(started.token);

    now = new Date("2026-07-25T12:10:00.000Z");
    await store.getSession(started.token);
    const beforeThreshold = await pool.query<{ last_seen_at: Date }>(
      "SELECT last_seen_at FROM sessions"
    );

    now = new Date("2026-07-25T12:16:00.000Z");
    await store.getSession(started.token);
    const afterThreshold = await pool.query<{ last_seen_at: Date }>(
      "SELECT last_seen_at FROM sessions"
    );

    now = new Date("2026-08-24T12:00:01.000Z");
    const expired = await store.getSession(started.token);
    const sessions = await pool.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM sessions"
    );

    expect(initial).toMatchObject({
      user: expect.objectContaining({ username: "clock" })
    });
    expect(beforeThreshold.rows[0].last_seen_at.toISOString()).toBe(
      "2026-07-25T12:00:00.000Z"
    );
    expect(afterThreshold.rows[0].last_seen_at.toISOString()).toBe(
      "2026-07-25T12:16:00.000Z"
    );
    expect(expired).toBeNull();
    expect(sessions.rows).toEqual([{ count: "0" }]);
  });

  it("supports owner story changes and admin overrides", async () => {
    const owner = await store.register({
      displayName: "Owner",
      password: "owner-password-2026",
      username: "owner"
    });
    const other = await store.register({
      displayName: "Other",
      password: "other-password-2026",
      username: "other"
    });
    const admin = await store.bootstrapAdmin({
      displayName: "Chatsim Admin",
      password: "admin-password-2026",
      username: "admin"
    });
    const story = await store.createStory(owner.user.id, {
      title: "Owner story"
    });

    await expect(
      store.updateStory(other.user.id, story.id, { title: "Stolen" })
    ).rejects.toMatchObject({ statusCode: 403 });

    const ownerUpdate = await store.updateStory(owner.user.id, story.id, {
      title: "Owner update"
    });
    const adminUpdate = await store.updateStory(admin.user.id, story.id, {
      title: "Admin update"
    });

    expect(ownerUpdate.title).toBe("Owner update");
    expect(adminUpdate.title).toBe("Admin update");

    await store.deleteStory(admin.user.id, story.id);
    expect(await store.getStory(story.id)).toBeNull();
  });

  it("lets an admin preserve an owner's ready media references", async () => {
    const owner = await store.register({
      displayName: "Media Owner",
      password: "media-owner-password",
      username: "media-admin-owner"
    });
    const admin = await store.bootstrapAdmin({
      displayName: "Chatsim Admin",
      password: "admin-password-2026",
      username: "admin"
    });
    const variants = JSON.stringify({
      card: { key: "variants/admin/card.webp" },
      full: { key: "variants/admin/full.webp" },
      thumb: { key: "variants/admin/thumb.webp" }
    });
    await pool.query(
      `INSERT INTO images (
         id, owner_id, kind, object_key, mime_type, width, height,
         size_bytes, status, variants
       )
       VALUES (
         'image-admin-cover', $1, 'story_cover', 'originals/admin-cover',
         'image/png', 100, 100, 100, 'ready', $2::jsonb
       )`,
      [owner.user.id, variants]
    );
    const story = await store.createStory(owner.user.id, {
      coverImageId: "image-admin-cover",
      title: "Owner media"
    });

    const updated = await store.updateStory(admin.user.id, story.id, {
      coverImageId: story.coverImageId,
      storyboard: story.storyboard,
      title: "Admin kept media"
    });

    expect(updated.title).toBe("Admin kept media");
    expect(updated.coverImageId).toBe("image-admin-cover");
  });

  it("bootstraps the admin once without creating a browser session", async () => {
    const first = await store.bootstrapAdmin({
      displayName: "Chatsim Admin",
      password: "first-admin-password",
      username: "admin"
    });
    const before = await pool.query<{ password_hash: string }>(
      "SELECT password_hash FROM users WHERE id = 'user-admin'"
    );
    const repeated = await store.bootstrapAdmin({
      displayName: "Replaced Admin",
      password: "second-admin-password",
      username: "replacement-admin"
    });
    const after = await pool.query<{ password_hash: string }>(
      "SELECT password_hash FROM users WHERE id = 'user-admin'"
    );
    const sessions = await pool.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM sessions WHERE user_id = 'user-admin'"
    );

    expect(first.user.username).toBe("admin");
    expect(repeated.user.username).toBe("admin");
    expect(after.rows[0].password_hash).toBe(before.rows[0].password_hash);
    expect(sessions.rows).toEqual([{ count: "0" }]);
  });

  it("returns stable cursor pages from the public story feed", async () => {
    const firstPage = await store.getStoryFeed({ limit: 10 });
    const secondPage = await store.getStoryFeed({
      cursor: firstPage.nextCursor ?? undefined,
      limit: 10
    });

    expect(firstPage.stories).toHaveLength(10);
    expect(firstPage.nextCursor).toEqual(expect.any(String));
    expect(secondPage.stories).toHaveLength(10);
    expect(
      secondPage.stories.some((story) =>
        firstPage.stories.some((firstStory) => firstStory.id === story.id)
      )
    ).toBe(false);
    expect(firstPage.stories[0]).toMatchObject({
      author: expect.objectContaining({
        avatarImage: null,
        displayName: expect.any(String)
      }),
      coverImage: null,
      coverFallbackColor: expect.any(String),
      presentationMode: expect.stringMatching(/^(phone|battle)$/)
    });
  });

  it("accepts only ready owned image IDs and hydrates story image references", async () => {
    const owner = await store.register({
      displayName: "Media Owner",
      password: "media-owner-password",
      username: "media-owner"
    });
    const other = await store.register({
      displayName: "Media Other",
      password: "media-other-password",
      username: "media-other"
    });
    const variants = {
      card: { key: "variants/cover/card.webp" },
      full: { key: "variants/cover/full.webp" },
      thumb: { key: "variants/cover/thumb.webp" }
    };
    await pool.query(
      `INSERT INTO images (
         id, owner_id, kind, object_key, mime_type, width, height,
         size_bytes, status, variants
       )
       VALUES
         ('image-cover', $1, 'story_cover', 'originals/cover', 'image/png',
          100, 100, 100, 'ready', $3::jsonb),
         ('image-avatar', $1, 'avatar', 'originals/avatar', 'image/png',
          100, 100, 100, 'ready', $3::jsonb),
         ('image-pending', $1, 'story_cover', 'staging/pending', 'image/png',
          NULL, NULL, 100, 'pending', '{}'::jsonb),
         ('image-other', $2, 'story_cover', 'originals/other', 'image/png',
          100, 100, 100, 'ready', $3::jsonb)`,
      [owner.user.id, other.user.id, JSON.stringify(variants)]
    );

    await expect(
      store.createStory(owner.user.id, { coverImageId: "image-other" })
    ).rejects.toMatchObject({ statusCode: 403 });
    await expect(
      store.createStory(owner.user.id, { coverImageId: "image-pending" })
    ).rejects.toMatchObject({ statusCode: 400 });

    const story = await store.createStory(owner.user.id, {
      coverImageId: "image-cover",
      storyboard: {
        activeSceneId: "scene-1",
        scenes: [
          {
            contact: {
              avatarImageId: "image-avatar",
              avatarUrl: "",
              initials: "M",
              name: "Maya",
              status: "online now",
              typingSpeedLevel: 3
            },
            id: "scene-1",
            messages: []
          }
        ]
      },
      title: "Hydrated media"
    });

    expect(story.coverImage).toEqual({
      id: "image-cover",
      variants: {
        card: "https://media.chatsim.philippeho.dev/variants/cover/card.webp",
        full: "https://media.chatsim.philippeho.dev/variants/cover/full.webp",
        thumb: "https://media.chatsim.philippeho.dev/variants/cover/thumb.webp"
      }
    });
    expect(
      (story.storyboard.scenes[0] as {
        contact: { avatarImage: { id: string } };
      }).contact.avatarImage.id
    ).toBe("image-avatar");

    await pool.query(
      "UPDATE images SET status = 'deleting' WHERE id = 'image-cover'"
    );
    await pool.query(
      "UPDATE stories SET cover_image_id = NULL WHERE id = $1",
      [story.id]
    );
    const titleOnly = await store.updateStory(owner.user.id, story.id, {
      title: "Title without reattaching"
    });

    expect(titleOnly.coverImageId).toBeNull();
    await expect(
      store.updateStory(owner.user.id, story.id, {
        coverImageId: "image-cover"
      })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("keeps image validation locked through a concurrent story write", async () => {
    const owner = await store.register({
      displayName: "Race Owner",
      password: "race-owner-password",
      username: "race-owner"
    });
    await pool.query(
      `INSERT INTO images (
         id, owner_id, kind, object_key, mime_type, width, height,
         size_bytes, status, variants
       )
       VALUES (
         'image-race-cover', $1, 'story_cover', 'originals/race-cover',
         'image/png', 100, 100, 100, 'ready', '{}'::jsonb
       )`,
      [owner.user.id]
    );
    const story = await store.createStory(owner.user.id, {
      title: "Race story"
    });
    const gate = createClientQueryGate(
      pool,
      (query) => /UPDATE stories\s+SET/.test(query)
    );
    const raceStore = await StoryStore.open({
      pool: gate.pool,
      publicMediaBaseUrl: "https://media.chatsim.philippeho.dev",
      runMigrations: false,
      startCleanup: false
    });
    const updatePromise = raceStore.updateStory(owner.user.id, story.id, {
      coverImageId: "image-race-cover"
    });
    await gate.queryReached;

    const deleteClient = await pool.connect();
    let deleteFinished = false;
    const deletePromise = (async () => {
      try {
        await deleteClient.query("BEGIN");
        await deleteClient.query(
          `UPDATE images
           SET status = 'deleting'
           WHERE id = 'image-race-cover'`
        );
        await deleteClient.query(
          `UPDATE stories
           SET cover_image_id = NULL
           WHERE id = $1`,
          [story.id]
        );
        await deleteClient.query("COMMIT");
      } catch (error) {
        await deleteClient.query("ROLLBACK");
        throw error;
      } finally {
        deleteFinished = true;
        deleteClient.release();
      }
    })();

    try {
      await waitForFinishedOrLock(
        () => deleteFinished,
        "UPDATE "
      );
    } finally {
      gate.releaseQuery();
    }

    await Promise.all([updatePromise, deletePromise]);
    const persisted = await pool.query<{
      cover_image_id: string | null;
      status: string;
    }>(
      `SELECT s.cover_image_id, i.status
       FROM stories s
       JOIN images i ON i.id = 'image-race-cover'
       WHERE s.id = $1`,
      [story.id]
    );

    expect(persisted.rows[0]).toEqual({
      cover_image_id: null,
      status: "deleting"
    });
  });
});
