import {
  mkdirSync,
  readFileSync,
  writeFileSync
} from "node:fs";
import { dirname, resolve } from "node:path";
import {
  randomBytes,
  scryptSync,
  timingSafeEqual
} from "node:crypto";

export type StoryVisibility = "public" | "private";
export type StoryPresentationMode = "phone" | "battle";

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
  createdAt: string;
  id: string;
  ownerId: string;
  storyboard: StoryboardPayload;
  title: string;
  updatedAt: string;
  visibility: StoryVisibility;
};

export type UserRole = "admin" | "member";

export type StoredUser = {
  accentColor: string;
  createdAt: string;
  displayName: string;
  id: string;
  passwordHash: string;
  passwordSalt: string;
  role: UserRole;
  username: string;
};

export type SessionRecord = {
  createdAt: string;
  token: string;
  userId: string;
};

export type StoryStoreData = {
  sessions: SessionRecord[];
  stories: StoryRecord[];
  users: StoredUser[];
};

export type PublicStoryCard = {
  coverColor: string;
  ownerId: string;
  sceneCount: number;
  storyId: string;
  title: string;
  updatedAt: string;
};

export type PublicProfile = {
  accentColor: string;
  displayName: string;
  id: string;
  stories: PublicStoryCard[];
  username: string;
};

export type SessionPayload = {
  token: string;
  user: PublicUser;
};

export type PublicUser = {
  displayName: string;
  id: string;
  role: UserRole;
  username: string;
};

const SESSION_TOKEN_BYTES = 32;
const PASSWORD_SALT_BYTES = 16;
const PASSWORD_HASH_BYTES = 64;
const SEED_TIMESTAMP = "2026-05-28T00:00:00.000Z";
const COVER_COLORS = ["#f472b6", "#22d3ee", "#a3e635", "#f59e0b", "#8b5cf6"];
const DEFAULT_RUNTIME_STORE_FILE = resolve(
  process.cwd(),
  "server/data/story-store.local.json"
);

type SeedProfileSpec = {
  displayName: string;
  id: string;
  storyId: string;
  storyTitle: string;
  username: string;
};

type ShortStoryMessage = {
  speaker: "viewer" | "contact";
  text: string;
};

type SeedStorySpec = {
  ownerId: string;
  presentationMode?: StoryPresentationMode;
  storyId: string;
  storyTitle: string;
  useCraftedSeed?: boolean;
  messages?: ShortStoryMessage[];
};

function createProfileStorySpec(profile: SeedProfileSpec): SeedStorySpec {
  return {
    ownerId: profile.id,
    storyId: profile.storyId,
    storyTitle: profile.storyTitle,
    useCraftedSeed: profile.storyId === "story-phil-1"
  };
}

// Dedicated battle script. Phil = opponent (top), Nor = player (bottom).
// Both sides are typed out in battle mode, so keep the lines short and punchy.
const BATTLE_SCRIPT: ShortStoryMessage[] = [
  { speaker: "viewer", text: "Nor! I challenge you to a battle!" },
  { speaker: "contact", text: "bro it's 3am... fine. let's go" },
  { speaker: "viewer", text: "Behold my ace! Go, Gary!" },
  { speaker: "contact", text: "that's a pigeon. that's just a pigeon" },
  { speaker: "viewer", text: "He is a TRAINED pigeon." },
  { speaker: "contact", text: "ok send it then 😤" },
  { speaker: "viewer", text: "Gary used Splash! Super effective!" },
  { speaker: "contact", text: "it is NOT super effective lmao" },
  { speaker: "viewer", text: "CRITICAL HIT! You're finished, Nor!" },
  { speaker: "contact", text: "ok that was kinda sick ngl. gg" }
];

const PHIL_BATTLE_STORY_SPEC: SeedStorySpec = {
  messages: BATTLE_SCRIPT,
  ownerId: "user-phil",
  presentationMode: "battle",
  storyId: "story-phil-battle",
  storyTitle: "Battle"
};

const DEFAULT_SEED_PROFILE_SPECS: SeedProfileSpec[] = [
  {
    displayName: "phil's stories",
    id: "user-phil",
    storyId: "story-phil-1",
    storyTitle: "Story",
    username: "phil"
  },
  {
    displayName: "neon sleepover",
    id: "user-neon",
    storyId: "story-neon-1",
    storyTitle: "Last seen typing",
    username: "neon"
  },
  {
    displayName: "orbit threads",
    id: "user-orbit",
    storyId: "story-orbit-1",
    storyTitle: "Soft launch",
    username: "orbit"
  },
  {
    displayName: "motel lobby",
    id: "user-motel",
    storyId: "story-motel-1",
    storyTitle: "Room 12",
    username: "motel"
  },
  {
    displayName: "void pop",
    id: "user-void",
    storyId: "story-void-1",
    storyTitle: "Read receipts",
    username: "void"
  }
];

const DUMMY_SEED_PROFILE_SPECS: SeedProfileSpec[] = Array.from(
  { length: 20 },
  (_, index) => {
    const number = String(index + 1).padStart(2, "0");

    return {
      displayName: `demo account ${number}`,
      id: `user-dummy-${number}`,
      storyId: `story-dummy-${number}`,
      storyTitle: `Placeholder Story ${number}`,
      username: `dummy${number}`
    };
  }
);

const SEED_PROFILE_SPECS = [
  ...DEFAULT_SEED_PROFILE_SPECS,
  ...DUMMY_SEED_PROFILE_SPECS
];

const EXTRA_PHIL_STORY_SPECS: SeedStorySpec[] = [
  {
    messages: [
      { speaker: "viewer", text: "hello" },
      { speaker: "contact", text: "wyd" },
      { speaker: "viewer", text: "nm you?" }
    ],
    ownerId: "user-phil",
    storyId: "story-phil-wyd",
    storyTitle: "wyd"
  },
  {
    messages: [
      { speaker: "viewer", text: "gm" },
      { speaker: "contact", text: "too early" },
      { speaker: "viewer", text: "lol fair" }
    ],
    ownerId: "user-phil",
    storyId: "story-phil-gm",
    storyTitle: "gm"
  },
  {
    messages: [
      { speaker: "viewer", text: "coffee?" },
      { speaker: "contact", text: "ya" },
      { speaker: "viewer", text: "omw" }
    ],
    ownerId: "user-phil",
    storyId: "story-phil-coffee",
    storyTitle: "coffee"
  },
  {
    messages: [
      { speaker: "viewer", text: "ping" },
      { speaker: "contact", text: "pong" },
      { speaker: "viewer", text: "cool" }
    ],
    ownerId: "user-phil",
    storyId: "story-phil-ping",
    storyTitle: "ping"
  },
  {
    messages: [
      { speaker: "viewer", text: "movie later?" },
      { speaker: "contact", text: "maybe" },
      { speaker: "viewer", text: "bet" }
    ],
    ownerId: "user-phil",
    storyId: "story-phil-movie",
    storyTitle: "movie"
  }
];

const SEED_STORY_SPECS: SeedStorySpec[] = [
  ...SEED_PROFILE_SPECS.flatMap((profile) =>
    profile.storyId === "story-phil-1"
      ? [createProfileStorySpec(profile), PHIL_BATTLE_STORY_SPEC]
      : [createProfileStorySpec(profile)]
  ),
  ...EXTRA_PHIL_STORY_SPECS
];

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function nowIso() {
  return new Date().toISOString();
}

function normalizePresentationMode(value: unknown): StoryPresentationMode {
  return value === "battle" ? "battle" : "phone";
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

function loadStoryDatabase(): StoryboardPayload {
  const storyPath = new URL("../src/data/storyDatabase.json", import.meta.url);
  const parsed = JSON.parse(readFileSync(storyPath, "utf8")) as StoryboardPayload;

  return {
    ...parsed,
    createdAt: SEED_TIMESTAMP,
    id: "story-phil-1",
    presentationMode: "phone",
    title: "Story",
    updatedAt: SEED_TIMESTAMP
  };
}

function createSeedUser(
  id: string,
  username: string,
  displayName: string,
  accentColor: string,
  role: UserRole = "member"
): StoredUser {
  return {
    ...createPasswordRecord("0000"),
    accentColor,
    createdAt: SEED_TIMESTAMP,
    displayName,
    id,
    role,
    username
  };
}

function createSeedUsers() {
  return [
    ...SEED_PROFILE_SPECS.map((profile, index) =>
      createSeedUser(
        profile.id,
        profile.username,
        profile.displayName,
        COVER_COLORS[index % COVER_COLORS.length]
      )
    ),
    createSeedUser("user-admin", "admin", "admin", "#0f172a", "admin")
  ];
}

function createPlaceholderStoryboard(id: string, title: string): StoryboardPayload {
  return {
    activeSceneId: "scene-1",
    createdAt: SEED_TIMESTAMP,
    id,
    presentationMode: "phone",
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
    updatedAt: SEED_TIMESTAMP
  };
}

function createShortStoryboard(
  id: string,
  title: string,
  messages: ShortStoryMessage[]
): StoryboardPayload {
  return {
    activeSceneId: "scene-1",
    createdAt: SEED_TIMESTAMP,
    id,
    presentationMode: "phone",
    scenes: [
      {
        contact: {
          avatarUrl: "",
          initials: "N",
          name: "Nor",
          status: "online now",
          typingSpeedLevel: 3
        },
        defaultPauseAfterMs: 700,
        defaultSpeakerTypingSpeedLevel: 4,
        id: "scene-1",
        messages: messages.map((message, index) => ({
          id: `${message.speaker}-${index + 1}`,
          pauseAfterMs: 700,
          speaker: message.speaker,
          text: message.text,
          typingSpeedLevel: 4,
          useDefaultPauseAfterMs: true,
          useDefaultTypingMs: true
        })),
        sceneTitle: title,
        viewer: {
          avatarUrl: "",
          initials: "P",
          name: "Phil",
          status: "online now"
        }
      }
    ],
    title,
    updatedAt: SEED_TIMESTAMP
  };
}

function createSeedStory(
  id: string,
  ownerId: string,
  title: string,
  coverColor: string,
  storyboard = createPlaceholderStoryboard(id, title)
): StoryRecord {
  return {
    coverColor,
    createdAt: SEED_TIMESTAMP,
    id,
    ownerId,
    storyboard: {
      ...storyboard,
      id,
      presentationMode: normalizePresentationMode(storyboard.presentationMode),
      title
    },
    title,
    updatedAt: SEED_TIMESTAMP,
    visibility: "public"
  };
}

function createSeedStories() {
  return SEED_STORY_SPECS.map((story, index) => {
    const storyboard = story.messages
      ? createShortStoryboard(story.storyId, story.storyTitle, story.messages)
      : story.useCraftedSeed
        ? loadStoryDatabase()
        : undefined;

    return createSeedStory(
      story.storyId,
      story.ownerId,
      story.storyTitle,
      COVER_COLORS[index % COVER_COLORS.length],
      storyboard
        ? {
            ...storyboard,
            presentationMode: story.presentationMode ?? storyboard.presentationMode
          }
        : undefined
    );
  });
}

export function createSeedStoreData(): StoryStoreData {
  const users = createSeedUsers();

  return {
    sessions: [],
    stories: createSeedStories(),
    users
  };
}

function getRuntimeStoreFile() {
  const configuredStoreFile = process.env.CHATSIM_STORE_FILE?.trim();

  return configuredStoreFile ? resolve(configuredStoreFile) : DEFAULT_RUNTIME_STORE_FILE;
}

function normalizeStoreData(data: StoryStoreData) {
  let changed = false;
  const seedStories = createSeedStories();
  const seedStoryById = new Map(
    seedStories.map((seedStory, index) => [seedStory.id, { index, seedStory }])
  );
  const seedUsers = createSeedUsers();

  data.sessions ??= [];
  data.stories ??= [];
  data.users ??= [];

  data.stories = data.stories.map((story) => {
    const presentationMode = normalizePresentationMode(
      story.storyboard?.presentationMode
    );

    if (story.storyboard?.presentationMode === presentationMode) {
      return story;
    }

    changed = true;
    return {
      ...story,
      storyboard: {
        ...story.storyboard,
        presentationMode
      }
    };
  });

  data.users = data.users.map((user) => {
    const role =
      user.username === "admin" ? "admin" : user.role ?? "member";

    if (user.role === role) {
      return user;
    }

    changed = true;
    return {
      ...user,
      role
    };
  });

  for (const seedUser of seedUsers) {
    if (!data.users.some((user) => user.username === seedUser.username)) {
      data.users.push(seedUser);
      changed = true;
    }
  }

  for (const seedStory of seedStories) {
    if (!data.stories.some((story) => story.id === seedStory.id)) {
      data.stories.push(seedStory);
      changed = true;
    }
  }

  data.stories = data.stories.map((story) => {
    const seedStory = seedStoryById.get(story.id)?.seedStory;
    const seedPresentationMode = seedStory?.storyboard.presentationMode;

    if (
      !seedPresentationMode ||
      story.storyboard.presentationMode === seedPresentationMode
    ) {
      return story;
    }

    changed = true;
    return {
      ...story,
      storyboard: {
        ...story.storyboard,
        presentationMode: seedPresentationMode
      }
    };
  });

  const orderedStories = [...data.stories].sort((firstStory, secondStory) => {
    const firstSeedIndex = seedStoryById.get(firstStory.id)?.index;
    const secondSeedIndex = seedStoryById.get(secondStory.id)?.index;

    if (firstSeedIndex !== undefined && secondSeedIndex !== undefined) {
      return firstSeedIndex - secondSeedIndex;
    }

    if (firstSeedIndex !== undefined) {
      return -1;
    }

    if (secondSeedIndex !== undefined) {
      return 1;
    }

    return 0;
  });

  if (orderedStories.some((story, index) => story.id !== data.stories[index]?.id)) {
    data.stories = orderedStories;
    changed = true;
  }

  return { changed, data };
}

export class StoryStore {
  private constructor(
    private data: StoryStoreData,
    private readonly dataFile?: string
  ) {}

  static createMemory(data = createSeedStoreData()) {
    return new StoryStore(normalizeStoreData(clone(data)).data);
  }

  static open(dataFile = getRuntimeStoreFile()) {
    try {
      const data = JSON.parse(readFileSync(dataFile, "utf8")) as StoryStoreData;
      const normalized = normalizeStoreData(data);
      const store = new StoryStore(normalized.data, dataFile);

      if (normalized.changed) {
        store.persist();
      }

      return store;
    } catch {
      const store = new StoryStore(createSeedStoreData(), dataFile);
      store.persist();
      return store;
    }
  }

  snapshot() {
    return clone(this.data);
  }

  getPublicProfiles(): PublicProfile[] {
    return this.data.users.filter((user) => user.role !== "admin").map((user) => ({
      accentColor: user.accentColor,
      displayName: user.displayName,
      id: user.id,
      stories: this.data.stories
        .filter((story) => story.ownerId === user.id && story.visibility === "public")
        .map((story) => ({
          coverColor: story.coverColor,
          ownerId: story.ownerId,
          sceneCount: Math.max(1, story.storyboard.scenes?.length ?? 1),
          storyId: story.id,
          title: story.title,
          updatedAt: story.updatedAt
        })),
      username: user.username
    }));
  }

  getStory(storyId: string) {
    const story = this.data.stories.find((currentStory) => currentStory.id === storyId);

    return story ? clone(story) : null;
  }

  getSession(token: string | undefined): SessionPayload | null {
    if (!token) {
      return null;
    }

    const session = this.data.sessions.find(
      (currentSession) => currentSession.token === token
    );
    const user = session
      ? this.data.users.find((currentUser) => currentUser.id === session.userId)
      : undefined;

    return session && user
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

    if (username.length < 3) {
      throw new Error("Username must be at least 3 characters.");
    }

    if (input.password.length < 4) {
      throw new Error("Password must be at least 4 characters.");
    }

    if (this.data.users.some((user) => user.username === username)) {
      throw new Error("Username is already taken.");
    }

    const user: StoredUser = {
      ...createPasswordRecord(input.password),
      accentColor: COVER_COLORS[this.data.users.length % COVER_COLORS.length],
      createdAt: nowIso(),
      displayName: input.displayName?.trim() || `${username}'s stories`,
      id: `user-${username}-${randomBytes(4).toString("hex")}`,
      role: "member",
      username
    };

    this.data.users.push(user);
    this.persist();

    return this.startSession(user);
  }

  async login(input: { password: string; username: string }): Promise<SessionPayload> {
    const username = normalizeUsername(input.username);
    const user = this.data.users.find(
      (currentUser) => currentUser.username === username
    );

    if (!user || !verifyPassword(input.password, user)) {
      throw new Error("Invalid username or password.");
    }

    return this.startSession(user);
  }

  logout(token: string | undefined) {
    if (!token) {
      return;
    }

    this.data.sessions = this.data.sessions.filter(
      (session) => session.token !== token
    );
    this.persist();
  }

  createStory(ownerId: string, patch: Partial<StoryRecord> = {}) {
    this.assertUser(ownerId);

    const storyCount = this.data.stories.filter(
      (story) => story.ownerId === ownerId
    ).length;
    const storyNumber = storyCount + 1;
    const id = `story-${ownerId.replace(/^user-/, "")}-${Date.now()}-${randomBytes(3).toString("hex")}`;
    const title = patch.title?.trim() || (storyCount === 0 ? "Story" : `Story ${storyNumber}`);
    const createdAt = nowIso();
    const storyboard =
      patch.storyboard ?? createPlaceholderStoryboard(id, title);
    const story: StoryRecord = {
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
    };

    this.data.stories.push(story);
    this.persist();

    return clone(story);
  }

  updateStory(ownerId: string, storyId: string, patch: Partial<StoryRecord>) {
    const story = this.findEditableStory(ownerId, storyId);
    const title = patch.title !== undefined ? patch.title : story.title;
    const updatedAt = nowIso();
    const nextStory: StoryRecord = {
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
    };

    this.data.stories = this.data.stories.map((currentStory) =>
      currentStory.id === storyId ? nextStory : currentStory
    );
    this.persist();

    return clone(nextStory);
  }

  deleteStory(ownerId: string, storyId: string) {
    this.findEditableStory(ownerId, storyId);
    this.data.stories = this.data.stories.filter((story) => story.id !== storyId);
    this.persist();
  }

  private assertUser(userId: string) {
    if (!this.data.users.some((user) => user.id === userId)) {
      throw new Error("User not found.");
    }
  }

  private findEditableStory(userId: string, storyId: string) {
    const story = this.data.stories.find(
      (currentStory) => currentStory.id === storyId
    );

    if (!story) {
      throw new Error("Story not found.");
    }

    const user = this.data.users.find((currentUser) => currentUser.id === userId);

    if (!user) {
      throw new Error("User not found.");
    }

    if (story.ownerId !== userId && user.role !== "admin") {
      throw new Error("Only the story owner can change this story.");
    }

    return story;
  }

  private startSession(user: StoredUser): SessionPayload {
    const session = {
      createdAt: nowIso(),
      token: randomBytes(SESSION_TOKEN_BYTES).toString("hex"),
      userId: user.id
    };

    this.data.sessions.push(session);
    this.persist();

    return {
      token: session.token,
      user: publicUser(user)
    };
  }

  private persist() {
    if (!this.dataFile) {
      return;
    }

    mkdirSync(dirname(this.dataFile), { recursive: true });
    writeFileSync(this.dataFile, `${JSON.stringify(this.data, null, 2)}\n`);
  }
}
