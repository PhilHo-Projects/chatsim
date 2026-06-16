import {
  randomBytes,
  scryptSync,
  timingSafeEqual
} from "node:crypto";
import type {
  PublicProfile,
  PublicUser,
  SessionPayload,
  SessionRecord,
  StoredUser,
  StoryRecord,
  StoryVisibility
} from "./storyStore";

const SESSION_TOKEN_BYTES = 32;
const PASSWORD_SALT_BYTES = 16;
const PASSWORD_HASH_BYTES = 64;
const COVER_COLORS = ["#f472b6", "#22d3ee", "#a3e635", "#f59e0b", "#8b5cf6"];

type D1Result<T> = {
  results: T[];
};

type D1BoundStatementLike = {
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<unknown>;
};

type D1PreparedStatementLike = D1BoundStatementLike & {
  bind(...values: unknown[]): D1BoundStatementLike;
};

type D1DatabaseLike = {
  prepare(sql: string): D1PreparedStatementLike;
};

type StoryRow = {
  cover_color: string;
  created_at: string;
  id: string;
  owner_id: string;
  storyboard_json: string;
  title: string;
  updated_at: string;
  visibility: StoryVisibility;
};

type UserRow = {
  accentColor?: string;
  accent_color?: string;
  createdAt?: string;
  created_at?: string;
  displayName?: string;
  display_name?: string;
  id: string;
  passwordHash?: string;
  password_hash?: string;
  passwordSalt?: string;
  password_salt?: string;
  role: "admin" | "member";
  username: string;
};

type SessionRow = {
  created_at: string;
  token: string;
  user_id: string;
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeUsername(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
}

function publicUser(user: StoredUser): PublicUser {
  return {
    displayName: user.displayName,
    id: user.id,
    role: user.role,
    username: user.username
  };
}

function createPasswordRecord(password: string) {
  const passwordSalt = randomBytes(PASSWORD_SALT_BYTES).toString("hex");
  const passwordHash = scryptSync(
    password,
    passwordSalt,
    PASSWORD_HASH_BYTES
  ).toString("hex");

  return { passwordHash, passwordSalt };
}

function verifyPassword(password: string, user: StoredUser) {
  const attemptedHash = scryptSync(
    password,
    user.passwordSalt,
    PASSWORD_HASH_BYTES
  );
  const storedHash = Buffer.from(user.passwordHash, "hex");

  return (
    attemptedHash.length === storedHash.length &&
    timingSafeEqual(attemptedHash, storedHash)
  );
}

function createPlaceholderStoryboard(id: string, title: string) {
  return {
    activeSceneId: "scene-1",
    createdAt: nowIso(),
    id,
    presentationMode: "phone" as const,
    scenes: [
      {
        contact: {
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
          avatarUrl: "",
          initials: "S",
          name: "Studio",
          status: "online now"
        }
      }
    ],
    title,
    updatedAt: nowIso()
  };
}

function toUser(row: UserRow): StoredUser {
  return {
    accentColor: row.accent_color ?? row.accentColor ?? COVER_COLORS[0],
    createdAt: row.created_at ?? row.createdAt ?? nowIso(),
    displayName: row.display_name ?? row.displayName ?? row.username,
    id: row.id,
    passwordHash: row.password_hash ?? row.passwordHash ?? "",
    passwordSalt: row.password_salt ?? row.passwordSalt ?? "",
    role: row.role,
    username: row.username
  };
}

function toStory(row: StoryRow): StoryRecord {
  return {
    coverColor: row.cover_color,
    createdAt: row.created_at,
    id: row.id,
    ownerId: row.owner_id,
    storyboard: JSON.parse(row.storyboard_json),
    title: row.title,
    updatedAt: row.updated_at,
    visibility: row.visibility
  };
}

function toStoryCard(story: StoryRecord) {
  return {
    coverColor: story.coverColor,
    ownerId: story.ownerId,
    sceneCount: Math.max(1, story.storyboard.scenes?.length ?? 1),
    storyId: story.id,
    title: story.title,
    updatedAt: story.updatedAt
  };
}

function createSession(userId: string): SessionRecord {
  return {
    createdAt: nowIso(),
    token: randomBytes(SESSION_TOKEN_BYTES).toString("hex"),
    userId
  };
}

function createStory(ownerId: string, storyCount: number, patch: Partial<StoryRecord>) {
  const storyNumber = storyCount + 1;
  const id = `story-${ownerId.replace(/^user-/, "")}-${Date.now()}-${randomBytes(3).toString("hex")}`;
  const title = patch.title?.trim() || (storyCount === 0 ? "Story" : `Story ${storyNumber}`);
  const createdAt = nowIso();
  const storyboard = patch.storyboard ?? createPlaceholderStoryboard(id, title);

  return {
    coverColor: patch.coverColor ?? COVER_COLORS[storyCount % COVER_COLORS.length],
    createdAt,
    id,
    ownerId,
    storyboard: {
      ...storyboard,
      id,
      title
    },
    title,
    updatedAt: createdAt,
    visibility: patch.visibility ?? "public"
  } satisfies StoryRecord;
}

function updateStoryRecord(story: StoryRecord, patch: Partial<StoryRecord>) {
  const title = patch.title !== undefined ? patch.title : story.title;
  const updatedAt = nowIso();

  return {
    ...story,
    ...patch,
    id: story.id,
    ownerId: story.ownerId,
    storyboard: {
      ...(patch.storyboard ?? story.storyboard),
      id: story.id,
      title
    },
    title,
    updatedAt
  } satisfies StoryRecord;
}

function assertEditableStory(
  user: StoredUser | undefined,
  story: StoryRecord | null
): asserts story is StoryRecord {
  if (!story) {
    throw new Error("Story not found.");
  }

  if (!user) {
    throw new Error("User not found.");
  }

  if (story.ownerId !== user.id && user.role !== "admin") {
    throw new Error("Only the story owner can change this story.");
  }
}

export class D1StoryStore {
  constructor(private readonly db: D1DatabaseLike) {}

  async getPublicProfiles(): Promise<PublicProfile[]> {
    const users = await this.getUsers();
    const stories = await this.getStories();

    return users.filter((user) => user.role !== "admin").map((user) => ({
      accentColor: user.accentColor,
      displayName: user.displayName,
      id: user.id,
      stories: stories
        .filter((story) => story.ownerId === user.id && story.visibility === "public")
        .map(toStoryCard),
      username: user.username
    }));
  }

  async getStory(storyId: string) {
    return (await this.getStories()).find((story) => story.id === storyId) ?? null;
  }

  async getSession(token: string | undefined): Promise<SessionPayload | null> {
    if (!token) {
      return null;
    }

    const session = await this.db
      .prepare("SELECT * FROM sessions WHERE token = ?")
      .bind(token)
      .first<SessionRow>();

    if (!session) {
      return null;
    }

    const user = await this.getUserById(session.user_id);

    return user
      ? {
          token: session.token,
          user: publicUser(user)
        }
      : null;
  }

  async register(input: {
    displayName?: string;
    password: string;
    username: string;
  }): Promise<SessionPayload> {
    const username = normalizeUsername(input.username);
    const users = await this.getUsers();

    if (username.length < 3) {
      throw new Error("Username must be at least 3 characters.");
    }

    if (input.password.length < 4) {
      throw new Error("Password must be at least 4 characters.");
    }

    if (users.some((user) => user.username === username)) {
      throw new Error("Username is already taken.");
    }

    const user: StoredUser = {
      ...createPasswordRecord(input.password),
      accentColor: COVER_COLORS[users.length % COVER_COLORS.length],
      createdAt: nowIso(),
      displayName: input.displayName?.trim() || `${username}'s stories`,
      id: `user-${username}-${randomBytes(4).toString("hex")}`,
      role: "member",
      username
    };

    await this.db
      .prepare(
        `INSERT INTO users
          (id, username, display_name, accent_color, password_hash, password_salt, role, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        user.id,
        user.username,
        user.displayName,
        user.accentColor,
        user.passwordHash,
        user.passwordSalt,
        user.role,
        user.createdAt
      )
      .run();

    return this.startSession(user);
  }

  async login(input: { password: string; username: string }): Promise<SessionPayload> {
    const username = normalizeUsername(input.username);
    const user = (await this.getUsers()).find(
      (currentUser) => currentUser.username === username
    );

    if (!user || !verifyPassword(input.password, user)) {
      throw new Error("Invalid username or password.");
    }

    return this.startSession(user);
  }

  async logout(token: string | undefined) {
    if (!token) {
      return;
    }

    await this.db.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
  }

  async createStory(ownerId: string, patch: Partial<StoryRecord> = {}) {
    const user = await this.getUserById(ownerId);

    if (!user) {
      throw new Error("User not found.");
    }

    const stories = await this.getStoriesByOwner(ownerId);
    const story = createStory(ownerId, stories.length, patch);

    await this.insertStory(story);

    return clone(story);
  }

  async updateStory(ownerId: string, storyId: string, patch: Partial<StoryRecord>) {
    const user = await this.getUserById(ownerId);
    const story = await this.getStory(storyId);

    assertEditableStory(user, story);

    const nextStory = updateStoryRecord(story, patch);

    await this.db
      .prepare(
        `UPDATE stories
        SET cover_color = ?, storyboard_json = ?, title = ?, updated_at = ?, visibility = ?
        WHERE id = ?`
      )
      .bind(
        nextStory.coverColor,
        JSON.stringify(nextStory.storyboard),
        nextStory.title,
        nextStory.updatedAt,
        nextStory.visibility,
        nextStory.id
      )
      .run();

    return clone(nextStory);
  }

  async deleteStory(ownerId: string, storyId: string) {
    const user = await this.getUserById(ownerId);
    const story = await this.getStory(storyId);

    assertEditableStory(user, story);

    await this.db.prepare("DELETE FROM stories WHERE id = ?").bind(storyId).run();
  }

  private async getUsers() {
    const rows = await this.db
      .prepare("SELECT * FROM users ORDER BY created_at ASC")
      .all<UserRow>();

    return rows.results.map(toUser);
  }

  private async getStories() {
    const rows = await this.db
      .prepare("SELECT * FROM stories ORDER BY created_at ASC")
      .all<StoryRow>();

    return rows.results.map(toStory);
  }

  private async getStoriesByOwner(ownerId: string) {
    const rows = await this.db
      .prepare("SELECT * FROM stories WHERE owner_id = ?")
      .bind(ownerId)
      .all<StoryRow>();

    return rows.results.map(toStory);
  }

  private async getUserById(userId: string) {
    return (await this.getUsers()).find((user) => user.id === userId);
  }

  private async insertStory(story: StoryRecord) {
    await this.db
      .prepare(
        `INSERT INTO stories
          (id, owner_id, storyboard_json, title, cover_color, visibility, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        story.id,
        story.ownerId,
        JSON.stringify(story.storyboard),
        story.title,
        story.coverColor,
        story.visibility,
        story.createdAt,
        story.updatedAt
      )
      .run();
  }

  private async startSession(user: StoredUser): Promise<SessionPayload> {
    const session = createSession(user.id);

    await this.db
      .prepare("INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)")
      .bind(session.token, session.userId, session.createdAt)
      .run();

    return {
      token: session.token,
      user: publicUser(user)
    };
  }
}
