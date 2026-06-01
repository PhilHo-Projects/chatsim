import {
  createBlankStoryboard,
  defaultStoryLibrary,
  normalizeStoryboard,
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

function createStoryboard(index: number, id: string, title: string): Storyboard {
  const source =
    index === 0 ? defaultStoryLibrary.stories[0] : createBlankStoryboard(index);

  return normalizeStoryboard(
    {
      ...source,
      createdAt: SEED_TIMESTAMP,
      id,
      title,
      updatedAt: SEED_TIMESTAMP
    },
    index
  );
}

export const seedStoryRecords: PlatformStoryRecord[] = profileSpecs.map(
  (profile, index) => ({
    coverColor: STORY_COVER_COLORS[index % STORY_COVER_COLORS.length],
    createdAt: SEED_TIMESTAMP,
    id: profile.storyId,
    ownerId: profile.id,
    storyboard: createStoryboard(index, profile.storyId, profile.storyTitle),
    title: profile.storyTitle,
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
