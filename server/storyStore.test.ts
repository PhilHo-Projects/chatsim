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
});
