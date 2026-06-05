import {
  createBlankStoryboard,
  defaultStoryLibrary,
  normalizeStoryboard,
  type PresentationMode,
  type SpeakerId,
  type Storyboard
} from "./conversationConfig";

export type PlatformStoryRecord = {
  coverColor: string;
  createdAt: string;
  id: string;
  ownerId: string;
  storyboard: Storyboard;
  title: string;
  updatedAt: string;
  visibility: "public" | "private";
};

export type PlatformStoryCard = {
  coverColor: string;
  ownerId: string;
  sceneCount: number;
  storyId: string;
  title: string;
  updatedAt: string;
};

export type PlatformProfile = {
  accentColor: string;
  displayName: string;
  id: string;
  stories: PlatformStoryCard[];
  username: string;
};

export type PlatformSession = {
  token: string;
  user: {
    displayName: string;
    id: string;
    role: "admin" | "member";
    username: string;
  };
};

export const STORY_COVER_COLORS = [
  "#f472b6",
  "#22d3ee",
  "#a3e635",
  "#f59e0b",
  "#8b5cf6"
] as const;

const SEED_TIMESTAMP = "2026-05-28T00:00:00.000Z";

const defaultProfileSpecs = [
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

const dummyProfileSpecs = Array.from({ length: 20 }, (_, index) => {
  const number = String(index + 1).padStart(2, "0");

  return {
    displayName: `demo account ${number}`,
    id: `user-dummy-${number}`,
    storyId: `story-dummy-${number}`,
    storyTitle: `Placeholder Story ${number}`,
    username: `dummy${number}`
  };
});

const profileSpecs = [...defaultProfileSpecs, ...dummyProfileSpecs];

type ShortStoryMessage = {
  speaker: SpeakerId;
  text: string;
};

type StorySpec = {
  ownerId: string;
  presentationMode?: PresentationMode;
  storyId: string;
  storyTitle: string;
  useCraftedSeed?: boolean;
  messages?: ShortStoryMessage[];
};

function createProfileStorySpec(profile: (typeof profileSpecs)[number]): StorySpec {
  return {
    ownerId: profile.id,
    storyId: profile.storyId,
    storyTitle: profile.storyTitle,
    useCraftedSeed: profile.storyId === "story-phil-1"
  };
}

// Dedicated battle script. Phil = opponent (top), Nor = player (bottom).
// Both sides are typed out in battle mode, so keep the lines short and punchy.
const battleScript: ShortStoryMessage[] = [
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

const philBattleStorySpec: StorySpec = {
  messages: battleScript,
  ownerId: "user-phil",
  presentationMode: "battle",
  storyId: "story-phil-battle",
  storyTitle: "Battle"
};

const extraPhilStorySpecs: StorySpec[] = [
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

const storySpecs: StorySpec[] = [
  ...profileSpecs.flatMap((profile) =>
    profile.storyId === "story-phil-1"
      ? [createProfileStorySpec(profile), philBattleStorySpec]
      : [createProfileStorySpec(profile)]
  ),
  ...extraPhilStorySpecs
];

function createStoryboard(
  index: number,
  id: string,
  title: string,
  presentationMode: PresentationMode,
  source: Storyboard = createBlankStoryboard(index)
): Storyboard {
  return normalizeStoryboard(
    {
      ...source,
      createdAt: SEED_TIMESTAMP,
      id,
      presentationMode,
      title,
      updatedAt: SEED_TIMESTAMP
    },
    index
  );
}

function createShortStoryboard(
  index: number,
  id: string,
  title: string,
  messages: ShortStoryMessage[],
  presentationMode: PresentationMode = "phone"
): Storyboard {
  return normalizeStoryboard(
    {
      activeSceneId: "scene-1",
      createdAt: SEED_TIMESTAMP,
      id,
      presentationMode,
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
          messages: messages.map((message, messageIndex) => ({
            id: `${message.speaker}-${messageIndex + 1}`,
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
    },
    index
  );
}

export const seedStoryRecords: PlatformStoryRecord[] = storySpecs.map(
  (story, index) => ({
    coverColor: STORY_COVER_COLORS[index % STORY_COVER_COLORS.length],
    createdAt: SEED_TIMESTAMP,
    id: story.storyId,
    ownerId: story.ownerId,
    storyboard: story.messages
      ? createShortStoryboard(
          index,
          story.storyId,
          story.storyTitle,
          story.messages,
          story.presentationMode ?? "phone"
        )
      : createStoryboard(
          index,
          story.storyId,
          story.storyTitle,
          story.presentationMode ?? "phone",
          story.useCraftedSeed ? defaultStoryLibrary.stories[0] : undefined
        ),
    title: story.storyTitle,
    updatedAt: SEED_TIMESTAMP,
    visibility: "public"
  })
);

function toStoryCard(story: PlatformStoryRecord): PlatformStoryCard {
  return {
    coverColor: story.coverColor,
    ownerId: story.ownerId,
    sceneCount: story.storyboard.scenes.length,
    storyId: story.id,
    title: story.title,
    updatedAt: story.updatedAt
  };
}

export const seedProfiles: PlatformProfile[] = profileSpecs.map(
  (profile, index) => ({
    accentColor: STORY_COVER_COLORS[index % STORY_COVER_COLORS.length],
    displayName: profile.displayName,
    id: profile.id,
    stories: seedStoryRecords
      .filter((story) => story.ownerId === profile.id)
      .map(toStoryCard),
    username: profile.username
  })
);

export function getSeedStoryRecord(storyId = "story-phil-1") {
  return (
    seedStoryRecords.find((story) => story.id === storyId) ??
    seedStoryRecords[0]
  );
}
