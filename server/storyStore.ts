import {
  createHash,
  randomBytes,
  randomUUID,
  scrypt as scryptCallback,
  timingSafeEqual
} from "node:crypto";
import { promisify } from "node:util";
import type { Pool, PoolClient } from "pg";
import canonicalSeed from "../src/data/platformSeed.json";
import { areMigrationsCurrent, runMigrations } from "./db/migrations";
import { createDatabasePool } from "./db/pool";
import { HttpError } from "./httpError";

export type StoryVisibility = "public" | "private";
export type StoryPresentationMode = "phone" | "battle";
export type UserRole = "admin" | "member";

export type ImageVariants = {
  card: string;
  full: string;
  thumb: string;
};

export type ImageReference = {
  id: string;
  variants: ImageVariants;
};

export type StoryboardPayload = {
  activeSceneId: string;
  presentationMode?: StoryPresentationMode;
  scenes: unknown[];
  createdAt?: string;
  id?: string;
  title?: string;
  updatedAt?: string;
};

export type StoryRecord = {
  coverColor: string;
  coverImage: ImageReference | null;
  coverImageId: string | null;
  createdAt: string;
  id: string;
  ownerId: string;
  storyboard: StoryboardPayload;
  title: string;
  updatedAt: string;
  visibility: StoryVisibility;
};

export type StoryPatch = {
  coverColor?: string;
  coverImageId?: string | null;
  storyboard?: StoryboardPayload;
  title?: string;
  visibility?: StoryVisibility;
};

export type PublicStoryCard = {
  coverColor: string;
  coverImage: ImageReference | null;
  ownerId: string;
  presentationMode: StoryPresentationMode;
  sceneCount: number;
  storyId: string;
  title: string;
  updatedAt: string;
};

export type PublicProfile = {
  accentColor: string;
  avatarImage: ImageReference | null;
  bio: string | null;
  displayName: string;
  id: string;
  stories: PublicStoryCard[];
  username: string;
};

export type PublicUser = {
  displayName: string;
  id: string;
  role: UserRole;
  username: string;
};

export type SessionPayload = {
  expiresAt: string;
  user: PublicUser;
};

export type StartedSession = SessionPayload & {
  token: string;
};

export type StoryFeedCard = {
  author: {
    avatarImage: ImageReference | null;
    displayName: string;
    id: string;
    username: string;
  };
  coverFallbackColor: string;
  coverImage: ImageReference | null;
  id: string;
  presentationMode: StoryPresentationMode;
  sceneCount: number;
  title: string;
  updatedAt: string;
};

type StoryStoreOpenOptions = {
  now?: () => Date;
  pool?: Pool;
  publicMediaBaseUrl?: string;
  runMigrations?: boolean;
  startCleanup?: boolean;
};

type UserRow = {
  accent_color: string;
  avatar_image_id: string | null;
  bio: string | null;
  display_name: string;
  id: string;
  password_hash: string | null;
  password_salt: string | null;
  role: UserRole;
  username: string;
};

type ImageJoin = {
  image_id: string | null;
  image_variants: unknown;
};

type StoryRow = ImageJoin & {
  cover_color: string;
  cover_image_id: string | null;
  created_at: Date;
  id: string;
  owner_id: string;
  presentation_mode: StoryPresentationMode;
  storyboard: StoryboardPayload;
  title: string;
  updated_at: Date;
  visibility: StoryVisibility;
};

const scrypt = promisify(scryptCallback);
const SESSION_TOKEN_BYTES = 32;
const PASSWORD_SALT_BYTES = 16;
const PASSWORD_HASH_BYTES = 64;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const LAST_SEEN_WRITE_INTERVAL_MS = 15 * 60 * 1000;
const SESSION_CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;
const COVER_COLORS = ["#f472b6", "#22d3ee", "#a3e635", "#f59e0b", "#8b5cf6"];
const COMMON_PASSWORDS = new Set([
  "0000",
  "123456789012",
  "letmeinletmein",
  "password",
  "password123",
  "qwertyqwerty"
]);
const DUMMY_PASSWORD_SALT = "0".repeat(PASSWORD_SALT_BYTES * 2);

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function normalizeUsername(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
}

function publicUser(user: UserRow): PublicUser {
  return {
    displayName: user.display_name,
    id: user.id,
    role: user.role,
    username: user.username
  };
}

async function derivePasswordHash(password: string, salt: string) {
  const derived = (await scrypt(
    password,
    salt,
    PASSWORD_HASH_BYTES
  )) as Buffer;

  return derived.toString("hex");
}

function validatePassword(password: string) {
  if (password.length < 12 || password.length > 128) {
    throw new HttpError(
      "Password must be between 12 and 128 characters.",
      400,
      "BAD_REQUEST"
    );
  }

  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    throw new HttpError("Choose a less common password.", 400, "BAD_REQUEST");
  }
}

async function createPasswordRecord(password: string) {
  validatePassword(password);
  const passwordSalt = randomBytes(PASSWORD_SALT_BYTES).toString("hex");

  return {
    passwordHash: await derivePasswordHash(password, passwordSalt),
    passwordSalt
  };
}

async function verifyPassword(password: string, user: UserRow | undefined) {
  const salt = user?.password_salt ?? DUMMY_PASSWORD_SALT;
  const attemptedHash = Buffer.from(
    await derivePasswordHash(password, salt),
    "hex"
  );
  const storedHash = user?.password_hash
    ? Buffer.from(user.password_hash, "hex")
    : Buffer.alloc(PASSWORD_HASH_BYTES);

  return (
    Boolean(user?.password_hash) &&
    attemptedHash.length === storedHash.length &&
    timingSafeEqual(attemptedHash, storedHash)
  );
}

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest();
}

function normalizePresentationMode(value: unknown): StoryPresentationMode {
  return value === "battle" ? "battle" : "phone";
}

function createPlaceholderStoryboard(id: string, title: string): StoryboardPayload {
  return {
    activeSceneId: "scene-1",
    id,
    presentationMode: "phone",
    scenes: [
      {
        contact: {
          avatarImageId: null,
          avatarUrl: "",
          initials: "M",
          name: "Maya",
          status: "online now",
          typingSpeedLevel: 3
        },
        defaultPauseAfterMs: 1000,
        defaultSpeakerTypingSpeedLevel: 3,
        id: "scene-1",
        messages: [
          {
            id: "viewer-1",
            pauseAfterMs: 1000,
            speaker: "viewer",
            text: "new story opening soon",
            typingSpeedLevel: 3,
            useDefaultPauseAfterMs: true,
            useDefaultTypingMs: true
          }
        ],
        sceneTitle: "Scene 1",
        viewer: {
          avatarImageId: null,
          avatarUrl: "",
          initials: "S",
          name: "Studio",
          status: "online now"
        }
      }
    ],
    title
  };
}

function sanitizeStoryboard(input: StoryboardPayload): StoryboardPayload {
  const storyboard = clone(input);

  for (const scene of storyboard.scenes) {
    if (!scene || typeof scene !== "object") {
      continue;
    }

    for (const speaker of ["contact", "viewer"] as const) {
      const profile = (scene as Record<string, unknown>)[speaker];

      if (profile && typeof profile === "object") {
        (profile as Record<string, unknown>).avatarUrl = "";
        delete (profile as Record<string, unknown>).avatarImage;
      }
    }
  }

  return storyboard;
}

function encodeCursor(updatedAt: string, id: string) {
  return Buffer.from(JSON.stringify([updatedAt, id]), "utf8").toString(
    "base64url"
  );
}

function decodeCursor(cursor: string) {
  try {
    const parsed = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8")
    ) as unknown;

    if (
      !Array.isArray(parsed) ||
      parsed.length !== 2 ||
      typeof parsed[0] !== "string" ||
      Number.isNaN(Date.parse(parsed[0])) ||
      typeof parsed[1] !== "string" ||
      parsed[1].length === 0
    ) {
      throw new Error("invalid");
    }

    return { id: parsed[1], updatedAt: parsed[0] };
  } catch {
    throw new HttpError("Invalid feed cursor.", 400, "BAD_REQUEST");
  }
}

function isUniqueViolation(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  );
}

export class StoryStore {
  private readonly now: () => Date;
  private readonly publicMediaBaseUrl: string;
  private readonly ownsPool: boolean;
  private cleanupTimer?: NodeJS.Timeout;

  private constructor(
    private readonly pool: Pool,
    options: StoryStoreOpenOptions,
    ownsPool: boolean
  ) {
    this.now = options.now ?? (() => new Date());
    this.publicMediaBaseUrl = (
      options.publicMediaBaseUrl ??
      process.env.R2_PUBLIC_BASE_URL ??
      ""
    ).replace(/\/+$/, "");
    this.ownsPool = ownsPool;

    if (options.startCleanup !== false) {
      this.cleanupTimer = setInterval(() => {
        void this.cleanupExpiredSessions();
      }, SESSION_CLEANUP_INTERVAL_MS);
      this.cleanupTimer.unref();
    }
  }

  static async open(options: StoryStoreOpenOptions = {}) {
    const ownsPool = !options.pool;
    const pool = options.pool ?? createDatabasePool();

    if (options.runMigrations !== false) {
      await runMigrations(pool);
    }

    const store = new StoryStore(pool, options, ownsPool);
    await store.cleanupExpiredSessions();

    if (
      process.env.ADMIN_BOOTSTRAP_USERNAME &&
      process.env.ADMIN_BOOTSTRAP_PASSWORD
    ) {
      await store.bootstrapAdmin({
        displayName:
          process.env.ADMIN_BOOTSTRAP_DISPLAY_NAME ?? "Chatsim Admin",
        password: process.env.ADMIN_BOOTSTRAP_PASSWORD,
        username: process.env.ADMIN_BOOTSTRAP_USERNAME
      });
    }

    return store;
  }

  async close() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    if (this.ownsPool) {
      await this.pool.end();
    }
  }

  async healthCheck() {
    try {
      const result = await this.pool.query<{ ok: number }>("SELECT 1 AS ok");
      return (
        result.rows[0]?.ok === 1 &&
        (await areMigrationsCurrent(this.pool))
      );
    } catch {
      return false;
    }
  }

  async seed() {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");

      for (const user of canonicalSeed.users) {
        await client.query(
          `INSERT INTO users (
             id, username, display_name, role, accent_color, bio, created_at,
             updated_at
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
           ON CONFLICT (id) DO UPDATE
           SET username = EXCLUDED.username,
               display_name = EXCLUDED.display_name,
               role = EXCLUDED.role,
               accent_color = EXCLUDED.accent_color,
               bio = EXCLUDED.bio,
               created_at = EXCLUDED.created_at,
               updated_at = EXCLUDED.updated_at
           WHERE users.password_hash IS NULL
             AND users.auth_provider IS NULL`,
          [
            user.id,
            user.username,
            user.displayName,
            user.role,
            user.accentColor,
            user.bio ?? null,
            user.createdAt
          ]
        );
      }

      for (const story of canonicalSeed.stories) {
        await client.query(
          `INSERT INTO stories (
             id, owner_id, title, visibility, presentation_mode,
             cover_color, storyboard, created_at, updated_at
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)
           ON CONFLICT (id) DO UPDATE
           SET owner_id = EXCLUDED.owner_id,
               title = EXCLUDED.title,
               visibility = EXCLUDED.visibility,
               presentation_mode = EXCLUDED.presentation_mode,
               cover_image_id = NULL,
               cover_color = EXCLUDED.cover_color,
               storyboard = EXCLUDED.storyboard,
               created_at = EXCLUDED.created_at,
               updated_at = EXCLUDED.updated_at`,
          [
            story.id,
            story.ownerId,
            story.title,
            story.visibility,
            normalizePresentationMode(story.storyboard.presentationMode),
            story.coverColor,
            JSON.stringify(sanitizeStoryboard(story.storyboard as StoryboardPayload)),
            story.createdAt,
            story.updatedAt
          ]
        );
      }

      // Showcase identities dropped from the canonical fixture have to be
      // removed, or the feed keeps serving profiles the repository no longer
      // describes. Only credential-free owners qualify: anyone who has
      // registered or linked an identity provider is a real account and is
      // never pruned, even if an id collides with a retired seed row.
      const seededUserIds = canonicalSeed.users.map((user) => user.id);
      const retiredOwners = `
        SELECT id FROM users
        WHERE password_hash IS NULL
          AND auth_provider IS NULL
          AND NOT (id = ANY($1::text[]))
      `;

      await client.query(
        `DELETE FROM stories WHERE owner_id IN (${retiredOwners})`,
        [seededUserIds]
      );
      await client.query(
        `DELETE FROM images WHERE owner_id IN (${retiredOwners})`,
        [seededUserIds]
      );
      await client.query(
        `DELETE FROM users
         WHERE password_hash IS NULL
           AND auth_provider IS NULL
           AND NOT (id = ANY($1::text[]))`,
        [seededUserIds]
      );

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async getPublicProfiles(): Promise<PublicProfile[]> {
    const usersResult = await this.pool.query<
      Pick<
        UserRow,
        | "accent_color"
        | "avatar_image_id"
        | "bio"
        | "display_name"
        | "id"
        | "username"
      > &
        ImageJoin
    >(
      `SELECT
         u.id,
         u.username,
         u.display_name,
         u.bio,
         u.accent_color,
         u.avatar_image_id,
         avatar.id AS image_id,
         avatar.variants AS image_variants
       FROM users u
       LEFT JOIN images avatar
         ON avatar.id = u.avatar_image_id AND avatar.status = 'ready'
       WHERE u.role <> 'admin'
       ORDER BY u.created_at, u.id`
    );
    const storiesResult = await this.pool.query<StoryRow>(
      `SELECT
         s.*,
         cover.id AS image_id,
         cover.variants AS image_variants
       FROM stories s
       LEFT JOIN images cover
         ON cover.id = s.cover_image_id AND cover.status = 'ready'
       WHERE s.visibility = 'public'
       ORDER BY s.created_at, s.id`
    );

    return usersResult.rows.map((user) => ({
      accentColor: user.accent_color,
      avatarImage: this.imageReference(user.image_id, user.image_variants),
      bio: user.bio,
      displayName: user.display_name,
      id: user.id,
      stories: storiesResult.rows
        .filter((story) => story.owner_id === user.id)
        .map((story) => ({
          coverColor: story.cover_color,
          coverImage: this.imageReference(
            story.image_id,
            story.image_variants
          ),
          ownerId: story.owner_id,
          presentationMode: story.presentation_mode,
          sceneCount: Math.max(1, story.storyboard.scenes?.length ?? 1),
          storyId: story.id,
          title: story.title,
          updatedAt: story.updated_at.toISOString()
        })),
      username: user.username
    }));
  }

  async getStoryFeed(input: { cursor?: string; limit?: number } = {}) {
    const limit = Math.max(1, Math.min(50, input.limit ?? 24));
    const cursor = input.cursor ? decodeCursor(input.cursor) : null;
    const values: unknown[] = [];
    const cursorClause = cursor
      ? "AND (s.updated_at, s.id) < ($1::timestamptz, $2::text)"
      : "";

    if (cursor) {
      values.push(cursor.updatedAt, cursor.id);
    }

    values.push(limit + 1);
    const limitParameter = `$${values.length}`;
    const result = await this.pool.query<
      StoryRow & {
        author_avatar_id: string | null;
        author_avatar_variants: unknown;
        author_display_name: string;
        author_id: string;
        author_username: string;
        scene_count: number;
      }
    >(
      `SELECT
         s.*,
         CASE
           WHEN jsonb_typeof(s.storyboard->'scenes') = 'array'
             THEN GREATEST(1, jsonb_array_length(s.storyboard->'scenes'))
           ELSE 1
         END AS scene_count,
         author.id AS author_id,
         author.username AS author_username,
         author.display_name AS author_display_name,
         avatar.id AS author_avatar_id,
         avatar.variants AS author_avatar_variants,
         cover.id AS image_id,
         cover.variants AS image_variants
       FROM stories s
       JOIN users author ON author.id = s.owner_id
       LEFT JOIN images avatar
         ON avatar.id = author.avatar_image_id AND avatar.status = 'ready'
       LEFT JOIN images cover
         ON cover.id = s.cover_image_id AND cover.status = 'ready'
       WHERE s.visibility = 'public'
       ${cursorClause}
       ORDER BY s.updated_at DESC, s.id DESC
       LIMIT ${limitParameter}`,
      values
    );
    const hasMore = result.rows.length > limit;
    const pageRows = hasMore ? result.rows.slice(0, limit) : result.rows;
    const stories: StoryFeedCard[] = pageRows.map((row) => ({
      author: {
        avatarImage: this.imageReference(
          row.author_avatar_id,
          row.author_avatar_variants
        ),
        displayName: row.author_display_name,
        id: row.author_id,
        username: row.author_username
      },
      coverFallbackColor: row.cover_color,
      coverImage: this.imageReference(row.image_id, row.image_variants),
      id: row.id,
      presentationMode: row.presentation_mode,
      sceneCount: Number(row.scene_count),
      title: row.title,
      updatedAt: row.updated_at.toISOString()
    }));
    const lastStory = stories.at(-1);

    return {
      stories,
      nextCursor:
        hasMore && lastStory
          ? encodeCursor(lastStory.updatedAt, lastStory.id)
          : null
    };
  }

  async getStory(storyId: string): Promise<StoryRecord | null> {
    const result = await this.pool.query<StoryRow>(
      `SELECT
         s.*,
         cover.id AS image_id,
         cover.variants AS image_variants
       FROM stories s
       LEFT JOIN images cover
         ON cover.id = s.cover_image_id AND cover.status = 'ready'
       WHERE s.id = $1`,
      [storyId]
    );

    if (!result.rows[0]) {
      return null;
    }

    const story = this.mapStory(result.rows[0]);
    story.storyboard = await this.hydrateStoryboardImages(story.storyboard);
    return story;
  }

  async getStoryPermissions(userId: string | null, storyId: string) {
    if (!userId) {
      return { canDelete: false, canEdit: false };
    }

    const result = await this.pool.query<{ allowed: boolean }>(
      `SELECT (s.owner_id = $1 OR u.role = 'admin') AS allowed
       FROM stories s
       JOIN users u ON u.id = $1
       WHERE s.id = $2`,
      [userId, storyId]
    );
    const allowed = result.rows[0]?.allowed ?? false;

    return { canDelete: allowed, canEdit: allowed };
  }

  async register(input: {
    displayName?: string;
    password: string;
    username: string;
  }): Promise<StartedSession> {
    const username = normalizeUsername(input.username);

    if (username.length < 3 || username.length > 32) {
      throw new HttpError(
        "Username must be between 3 and 32 characters.",
        400,
        "BAD_REQUEST"
      );
    }

    const password = await createPasswordRecord(input.password);
    const user: UserRow = {
      accent_color: COVER_COLORS[0],
      avatar_image_id: null,
      bio: null,
      display_name: input.displayName?.trim() || username,
      id: `user-${randomUUID()}`,
      password_hash: password.passwordHash,
      password_salt: password.passwordSalt,
      role: "member",
      username
    };
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO users (
           id, username, display_name, role, accent_color,
           password_hash, password_salt, created_at
         )
         VALUES ($1, $2, $3, 'member', $4, $5, $6, $7)`,
        [
          user.id,
          user.username,
          user.display_name,
          user.accent_color,
          user.password_hash,
          user.password_salt,
          this.now()
        ]
      );
      const session = await this.startSession(client, user);
      await client.query("COMMIT");
      return session;
    } catch (error) {
      await client.query("ROLLBACK");

      if (isUniqueViolation(error)) {
        throw new HttpError("Username is already taken.", 409, "CONFLICT");
      }

      throw error;
    } finally {
      client.release();
    }
  }

  async bootstrapAdmin(input: {
    displayName: string;
    password: string;
    username: string;
  }) {
    const existingResult = await this.pool.query<UserRow>(
      "SELECT * FROM users WHERE id = 'user-admin'"
    );

    if (existingResult.rows[0]) {
      return { user: publicUser(existingResult.rows[0]) };
    }

    const username = normalizeUsername(input.username);

    if (username.length < 3 || username.length > 32) {
      throw new HttpError(
        "Admin username must be between 3 and 32 characters.",
        400,
        "BAD_REQUEST"
      );
    }

    const password = await createPasswordRecord(input.password);
    const user: UserRow = {
      accent_color: "#0f172a",
      avatar_image_id: null,
      bio: null,
      display_name: input.displayName.trim() || "Chatsim Admin",
      id: "user-admin",
      password_hash: password.passwordHash,
      password_salt: password.passwordSalt,
      role: "admin",
      username
    };
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      const inserted = await client.query<UserRow>(
        `INSERT INTO users (
           id, username, display_name, role, accent_color,
           password_hash, password_salt, created_at
         )
         VALUES ($1, $2, $3, 'admin', $4, $5, $6, $7)
         ON CONFLICT (id) DO NOTHING
         RETURNING *`,
        [
          user.id,
          user.username,
          user.display_name,
          user.accent_color,
          user.password_hash,
          user.password_salt,
          this.now()
        ]
      );
      await client.query("COMMIT");
      const bootstrapped = inserted.rows[0];

      if (bootstrapped) {
        return { user: publicUser(bootstrapped) };
      }

      const raced = await this.pool.query<UserRow>(
        "SELECT * FROM users WHERE id = 'user-admin'"
      );

      if (!raced.rows[0]) {
        throw new Error("Admin bootstrap did not create an account.");
      }

      return { user: publicUser(raced.rows[0]) };
    } catch (error) {
      await client.query("ROLLBACK");

      if (isUniqueViolation(error)) {
        throw new HttpError(
          "Admin username is already in use.",
          409,
          "CONFLICT"
        );
      }

      throw error;
    } finally {
      client.release();
    }
  }

  async login(input: {
    password: string;
    username: string;
  }): Promise<StartedSession> {
    const username = normalizeUsername(input.username);
    const result = await this.pool.query<UserRow>(
      "SELECT * FROM users WHERE username = $1",
      [username]
    );
    const user = result.rows[0];

    if (!(await verifyPassword(input.password, user))) {
      throw new HttpError(
        "Invalid username or password.",
        401,
        "UNAUTHENTICATED"
      );
    }

    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      const session = await this.startSession(client, user);
      await client.query("COMMIT");
      return session;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async getSession(token: string | undefined): Promise<SessionPayload | null> {
    if (!token) {
      return null;
    }

    const hash = tokenHash(token);
    const result = await this.pool.query<
      UserRow & {
        expires_at: Date;
        last_seen_at: Date;
      }
    >(
      `SELECT u.*, s.expires_at, s.last_seen_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1`,
      [hash]
    );
    const session = result.rows[0];

    if (!session) {
      return null;
    }

    const now = this.now();

    if (session.expires_at.getTime() <= now.getTime()) {
      await this.pool.query("DELETE FROM sessions WHERE token_hash = $1", [
        hash
      ]);
      return null;
    }

    if (
      now.getTime() - session.last_seen_at.getTime() >=
      LAST_SEEN_WRITE_INTERVAL_MS
    ) {
      await this.pool.query(
        "UPDATE sessions SET last_seen_at = $1 WHERE token_hash = $2",
        [now, hash]
      );
    }

    return {
      expiresAt: session.expires_at.toISOString(),
      user: publicUser(session)
    };
  }

  async logout(token: string | undefined) {
    if (token) {
      await this.pool.query("DELETE FROM sessions WHERE token_hash = $1", [
        tokenHash(token)
      ]);
    }
  }

  async cleanupExpiredSessions() {
    await this.pool.query("DELETE FROM sessions WHERE expires_at <= $1", [
      this.now()
    ]);
  }

  async updateCurrentUser(
    userId: string,
    patch: {
      avatarImageId?: string | null;
      bio?: string | null;
      displayName?: string;
    }
  ) {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");

      if (patch.avatarImageId) {
        await this.assertReadyOwnedImage(
          client,
          userId,
          patch.avatarImageId,
          ["avatar", "profile"]
        );
      }

      const result = await client.query<UserRow>(
        `UPDATE users
         SET display_name = COALESCE($1, display_name),
             bio = CASE WHEN $6::boolean THEN $7 ELSE bio END,
             avatar_image_id = CASE
               WHEN $2::boolean THEN $3
               ELSE avatar_image_id
             END,
             updated_at = $4
         WHERE id = $5
         RETURNING *`,
        [
          patch.displayName,
          patch.avatarImageId !== undefined,
          patch.avatarImageId ?? null,
          this.now(),
          userId,
          patch.bio !== undefined,
          patch.bio ?? null
        ]
      );

      if (!result.rows[0]) {
        throw new HttpError("User not found.", 404, "NOT_FOUND");
      }

      await client.query("COMMIT");
      return publicUser(result.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async createStory(ownerId: string, patch: StoryPatch = {}) {
    await this.assertUser(ownerId);
    const client = await this.pool.connect();
    let id = "";

    try {
      await client.query("BEGIN");
      await this.validateStoryImageReferences(client, ownerId, patch);
      const countResult = await client.query<{ count: string }>(
        "SELECT COUNT(*)::text AS count FROM stories WHERE owner_id = $1",
        [ownerId]
      );
      const storyCount = Number(countResult.rows[0]?.count ?? 0);
      id = `story-${randomUUID()}`;
      const title =
        patch.title?.trim() ||
        (storyCount === 0 ? "Story" : `Story ${storyCount + 1}`);
      const timestamp = this.now();
      const storyboard = sanitizeStoryboard(
        patch.storyboard ?? createPlaceholderStoryboard(id, title)
      );
      const presentationMode = normalizePresentationMode(
        storyboard.presentationMode
      );
      await client.query(
        `INSERT INTO stories (
           id, owner_id, title, visibility, presentation_mode, cover_image_id,
           cover_color, storyboard, created_at, updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $9)`,
        [
          id,
          ownerId,
          title,
          patch.visibility ?? "public",
          presentationMode,
          patch.coverImageId ?? null,
          patch.coverColor ?? COVER_COLORS[storyCount % COVER_COLORS.length],
          JSON.stringify({ ...storyboard, id, presentationMode, title }),
          timestamp
        ]
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    const created = await this.getStory(id);

    if (!created) {
      throw new Error("Created story could not be loaded.");
    }

    return created;
  }

  async updateStory(
    userId: string,
    storyId: string,
    patch: StoryPatch
  ) {
    const initial = await this.findEditableStory(userId, storyId);
    const client = await this.pool.connect();
    let title = "";

    try {
      await client.query("BEGIN");
      await this.validateStoryImageReferences(client, initial.ownerId, patch);
      const current = await this.findEditableStory(
        userId,
        storyId,
        client,
        true
      );
      title =
        patch.title !== undefined ? patch.title.trim() : current.title;

      if (!title) {
        throw new HttpError("Story title is required.", 400, "BAD_REQUEST");
      }

      const storyboard = sanitizeStoryboard(
        patch.storyboard ?? current.storyboard
      );
      const presentationMode = normalizePresentationMode(
        storyboard.presentationMode ?? current.storyboard.presentationMode
      );
      await client.query(
        `UPDATE stories
         SET title = $1,
             visibility = $2,
             presentation_mode = $3,
             cover_image_id = $4,
             cover_color = $5,
             storyboard = $6::jsonb,
             updated_at = $7
         WHERE id = $8`,
        [
          title,
          patch.visibility ?? current.visibility,
          presentationMode,
          patch.coverImageId === undefined
            ? current.coverImageId
            : patch.coverImageId,
          patch.coverColor ?? current.coverColor,
          JSON.stringify({
            ...storyboard,
            id: current.id,
            presentationMode,
            title
          }),
          this.now(),
          storyId
        ]
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    const updated = await this.getStory(storyId);

    if (!updated) {
      throw new Error("Updated story could not be loaded.");
    }

    return updated;
  }

  async deleteStory(userId: string, storyId: string) {
    await this.findEditableStory(userId, storyId);
    await this.pool.query("DELETE FROM stories WHERE id = $1", [storyId]);
  }

  private async assertUser(userId: string) {
    const result = await this.pool.query("SELECT 1 FROM users WHERE id = $1", [
      userId
    ]);

    if (result.rowCount === 0) {
      throw new HttpError("User not found.", 404, "NOT_FOUND");
    }
  }

  private async validateStoryImageReferences(
    client: Pick<Pool, "query">,
    userId: string,
    patch: StoryPatch
  ) {
    const references: Array<{ id: string; kinds: string[] }> = [];

    if (patch.coverImageId) {
      references.push({
        id: patch.coverImageId,
        kinds: ["story_cover", "scene_art"]
      });
    }

    if (patch.storyboard) {
      const avatarImageIds = this.storyboardAvatarImageIds(patch.storyboard);

      for (const imageId of avatarImageIds) {
        references.push({
          id: imageId,
          kinds: ["avatar", "profile", "sprite"]
        });
      }
    }

    references.sort((left, right) => left.id.localeCompare(right.id));

    for (const reference of references) {
      await this.assertReadyOwnedImage(
        client,
        userId,
        reference.id,
        reference.kinds
      );
    }
  }

  private async assertReadyOwnedImage(
    client: Pick<Pool, "query">,
    userId: string,
    imageId: string,
    allowedKinds: string[]
  ) {
    const result = await client.query<{
      kind: string;
      owner_id: string;
      status: string;
    }>(
      "SELECT owner_id, kind, status FROM images WHERE id = $1 FOR UPDATE",
      [imageId]
    );
    const image = result.rows[0];

    if (!image || image.status !== "ready") {
      throw new HttpError("Image must be ready.", 400, "BAD_REQUEST");
    }

    if (image.owner_id !== userId) {
      throw new HttpError(
        "Image belongs to another user.",
        403,
        "FORBIDDEN"
      );
    }

    if (!allowedKinds.includes(image.kind)) {
      throw new HttpError(
        "Image kind cannot be used here.",
        400,
        "BAD_REQUEST"
      );
    }
  }

  private storyboardAvatarImageIds(storyboard: StoryboardPayload) {
    const ids = new Set<string>();

    for (const scene of storyboard.scenes) {
      if (!scene || typeof scene !== "object") {
        continue;
      }

      for (const speaker of ["contact", "viewer"] as const) {
        const profile = (scene as Record<string, unknown>)[speaker];

        if (!profile || typeof profile !== "object") {
          continue;
        }

        const imageId = (profile as Record<string, unknown>).avatarImageId;

        if (typeof imageId === "string" && imageId.trim()) {
          ids.add(imageId);
        }
      }
    }

    return [...ids];
  }

  private async hydrateStoryboardImages(storyboard: StoryboardPayload) {
    const hydrated = sanitizeStoryboard(storyboard);
    const imageIds = this.storyboardAvatarImageIds(hydrated);

    if (imageIds.length === 0) {
      return hydrated;
    }

    const result = await this.pool.query<{
      id: string;
      variants: unknown;
    }>(
      `SELECT id, variants
       FROM images
       WHERE id = ANY($1::text[]) AND status = 'ready'`,
      [imageIds]
    );
    const images = new Map(
      result.rows.map((row) => [
        row.id,
        this.imageReference(row.id, row.variants)
      ])
    );

    for (const scene of hydrated.scenes) {
      if (!scene || typeof scene !== "object") {
        continue;
      }

      for (const speaker of ["contact", "viewer"] as const) {
        const profile = (scene as Record<string, unknown>)[speaker];

        if (!profile || typeof profile !== "object") {
          continue;
        }

        const record = profile as Record<string, unknown>;
        const imageId = record.avatarImageId;
        record.avatarImage =
          typeof imageId === "string" ? images.get(imageId) ?? null : null;
        record.avatarUrl = "";
      }
    }

    return hydrated;
  }

  private async findEditableStory(
    userId: string,
    storyId: string,
    queryable: Pick<Pool, "query"> = this.pool,
    forUpdate = false
  ) {
    const result = await queryable.query<
      StoryRow & {
        requester_role: UserRole;
      }
    >(
      `SELECT
         s.*,
         requester.role AS requester_role,
         NULL::text AS image_id,
         NULL::jsonb AS image_variants
       FROM stories s
       JOIN users requester ON requester.id = $1
       WHERE s.id = $2
       ${forUpdate ? "FOR UPDATE OF s" : ""}`,
      [userId, storyId]
    );
    const row = result.rows[0];

    if (!row) {
      throw new HttpError("Story not found.", 404, "NOT_FOUND");
    }

    if (row.owner_id !== userId && row.requester_role !== "admin") {
      throw new HttpError(
        "Only the story owner can change this story.",
        403,
        "FORBIDDEN"
      );
    }

    return this.mapStory(row);
  }

  private async startSession(client: PoolClient, user: UserRow) {
    const now = this.now();
    const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
    const token = randomBytes(SESSION_TOKEN_BYTES).toString("base64url");

    await client.query(
      `INSERT INTO sessions (
         token_hash, user_id, created_at, expires_at, last_seen_at
       )
       VALUES ($1, $2, $3, $4, $3)`,
      [tokenHash(token), user.id, now, expiresAt]
    );

    return {
      expiresAt: expiresAt.toISOString(),
      token,
      user: publicUser(user)
    };
  }

  private mapStory(row: StoryRow): StoryRecord {
    return {
      coverColor: row.cover_color,
      coverImage: this.imageReference(row.image_id, row.image_variants),
      coverImageId: row.cover_image_id,
      createdAt: row.created_at.toISOString(),
      id: row.id,
      ownerId: row.owner_id,
      storyboard: sanitizeStoryboard(row.storyboard),
      title: row.title,
      updatedAt: row.updated_at.toISOString(),
      visibility: row.visibility
    };
  }

  private imageReference(
    imageId: string | null,
    variantsValue: unknown
  ): ImageReference | null {
    if (
      !imageId ||
      !this.publicMediaBaseUrl ||
      !variantsValue ||
      typeof variantsValue !== "object"
    ) {
      return null;
    }

    const variants = variantsValue as Record<
      keyof ImageVariants,
      string | { key?: string }
    >;
    const url = (value: string | { key?: string } | undefined) => {
      const key = typeof value === "string" ? value : value?.key;
      return key ? `${this.publicMediaBaseUrl}/${key.replace(/^\/+/, "")}` : "";
    };
    const reference = {
      card: url(variants.card),
      full: url(variants.full),
      thumb: url(variants.thumb)
    };

    return Object.values(reference).every(Boolean)
      ? { id: imageId, variants: reference }
      : null;
  }
}
