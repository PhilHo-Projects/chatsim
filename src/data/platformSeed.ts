import {
  normalizeStoryboard,
  type PresentationMode,
  type Storyboard
} from "./conversationConfig";
import canonicalSeed from "./platformSeed.json";

export type ImageVariants = {
  card: string;
  full: string;
  thumb: string;
};

export type ImageReference = {
  id: string;
  variants: ImageVariants;
};

export type PlatformStoryRecord = {
  coverColor: string;
  coverImage?: ImageReference | null;
  coverImageId?: string | null;
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
  coverImage?: ImageReference | null;
  ownerId: string;
  presentationMode?: PresentationMode;
  sceneCount: number;
  storyId: string;
  title: string;
  updatedAt: string;
};

export type PlatformProfile = {
  accentColor: string;
  avatarImage?: ImageReference | null;
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

export const seedStoryRecords: PlatformStoryRecord[] =
  canonicalSeed.stories.map((story, index) => ({
    coverColor: story.coverColor,
    createdAt: story.createdAt,
    id: story.id,
    ownerId: story.ownerId,
    storyboard: normalizeStoryboard(
      story.storyboard as unknown as Parameters<typeof normalizeStoryboard>[0],
      index
    ),
    title: story.title,
    updatedAt: story.updatedAt,
    visibility: story.visibility as "public" | "private"
  }));

function toStoryCard(story: PlatformStoryRecord): PlatformStoryCard {
  return {
    coverColor: story.coverColor,
    ownerId: story.ownerId,
    presentationMode: story.storyboard.presentationMode,
    sceneCount: story.storyboard.scenes.length,
    storyId: story.id,
    title: story.title,
    updatedAt: story.updatedAt
  };
}

export const seedProfiles: PlatformProfile[] = canonicalSeed.users.map(
  (user) => ({
    accentColor: user.accentColor,
    displayName: user.displayName,
    id: user.id,
    stories: seedStoryRecords
      .filter((story) => story.ownerId === user.id)
      .map(toStoryCard),
    username: user.username
  })
);

export function getSeedStoryRecord(storyId = "story-phil-1") {
  return (
    seedStoryRecords.find((story) => story.id === storyId) ??
    seedStoryRecords[0]
  );
}
