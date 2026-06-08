import storyDatabase from "./storyDatabase.json";
import mayaAnimeAvatar from "../assets/maya-anime-avatar.png";
import mysterySpeakerAvatar from "../assets/mystery-speaker-avatar.png";

export type SpeakerId = "viewer" | "contact";
export type PresentationMode = "phone" | "battle";
export type SpeedLevel = 1 | 2 | 3 | 4 | 5;

export type ConversationMessage = {
  id: string;
  speaker: SpeakerId;
  text: string;
  typingSpeedLevel?: SpeedLevel;
  pauseAfterMs?: number;
  useDefaultTypingMs?: boolean;
  useDefaultPauseAfterMs?: boolean;
};

export type ConversationProfile = {
  name: string;
  initials: string;
};

export type ViewerProfile = ConversationProfile & {
  avatarUrl: string;
  status: string;
};

export type ContactProfile = ConversationProfile & {
  status: string;
  avatarUrl: string;
  typingSpeedLevel: SpeedLevel;
};

export type ConversationConfig = {
  sceneTitle: string;
  defaultSpeakerTypingSpeedLevel: SpeedLevel;
  defaultPauseAfterMs: number;
  contact: ContactProfile;
  viewer: ViewerProfile;
  messages: ConversationMessage[];
};

export type StoryScene = ConversationConfig & {
  id: string;
  createdByUser?: boolean;
};

export type StoryDatabase = {
  activeSceneId: string;
  scenes: StoryScene[];
};

export type Storyboard = StoryDatabase & {
  createdAt: string;
  id: string;
  presentationMode: PresentationMode;
  title: string;
  updatedAt: string;
};

export type StoryLibrary = {
  activeStoryId: string;
  stories: Storyboard[];
};

export const PROFILE_STATUS_OPTIONS = [
  { label: "Online", value: "online now" },
  { label: "Busy", value: "busy" },
  { label: "Away", value: "away" }
] as const;

type ConversationMessageInput = Omit<
  Partial<ConversationMessage>,
  "speaker" | "typingSpeedLevel"
> & {
  speaker?: unknown;
  typingSpeedLevel?: unknown;
  typingMs?: unknown;
};

type ConversationProfileInput = {
  name?: unknown;
  initials?: unknown;
};

type ContactProfileInput = ConversationProfileInput & {
  status?: unknown;
  avatarUrl?: unknown;
  typingSpeedLevel?: unknown;
  typingSpeedMsPerCharacter?: unknown;
};

type ViewerProfileInput = ConversationProfileInput & {
  avatarUrl?: unknown;
  status?: unknown;
  typingSpeedLevel?: unknown;
  typingSpeedMsPerCharacter?: unknown;
};

type ConversationConfigInput = {
  sceneTitle?: string;
  defaultSpeakerTypingSpeedLevel?: unknown;
  defaultContactTypingMs?: unknown;
  defaultPauseAfterMs?: unknown;
  contact?: ContactProfileInput;
  viewer?: ViewerProfileInput;
  messages?: ConversationMessageInput[];
};

type StorySceneInput = ConversationConfigInput & {
  createdByUser?: unknown;
  id?: unknown;
};

type StoryDatabaseInput = {
  activeSceneId?: unknown;
  scenes?: unknown;
};

type StoryboardInput = StoryDatabaseInput & {
  createdAt?: unknown;
  id?: unknown;
  presentationMode?: unknown;
  title?: unknown;
  updatedAt?: unknown;
};

type StoryLibraryInput = {
  activeStoryId?: unknown;
  stories?: unknown;
};

export const EDITOR_PASSWORD = "0000";
export const SHOW_SCRIPT_EDITOR = true;
export const EDITOR_REQUIRES_PASSWORD = !import.meta.env.DEV;
export const CONVERSATION_STORAGE_KEY = "story.conversationConfig.v3";
export const EDITOR_UNLOCK_STORAGE_KEY = "story.editorUnlockAt.v1";

const MIN_PAUSE_MS = 0;
const MAX_PAUSE_MS = 5000;
const EDITOR_UNLOCK_TTL_MS = 24 * 60 * 60 * 1000;
export const MAX_STORY_SCENE_COUNT = 10;
const DEFAULT_TIMESTAMP = "2026-05-14T00:00:00.000Z";
const SPEAKER_TYPING_REFERENCE_CHARACTERS = 24;
const SPEAKER_TYPING_EXTRA_CHARACTERS_PER_BASE_DURATION = 64;
const SPEAKER_TYPING_MAX_MULTIPLIER = 5;

export const SCENE_MESSAGE_WARNING_COUNT = 60;
export const SCENE_MESSAGE_MAX_COUNT = 100;

export const POV_TYPING_SPEED_MS_PER_CHARACTER = [
  0,
  115,
  85,
  58,
  42,
  30
] as const;

export const SPEAKER_TYPING_DURATION_MS = [
  0,
  1800,
  1400,
  1100,
  800,
  550
] as const;

const fallbackConfig: ConversationConfig = {
  sceneTitle: "Movie Night",
  defaultSpeakerTypingSpeedLevel: 3,
  defaultPauseAfterMs: 1000,
  contact: {
    name: "Maya",
    initials: "M",
    status: "online now",
    // Empty by default: an unset avatar renders the generic placeholder. The
    // crafted seed story re-applies its signature portrait in normalizeStoryboard.
    avatarUrl: "",
    typingSpeedLevel: 3
  },
  viewer: {
    name: "Frank",
    initials: "F",
    status: "online now",
    avatarUrl: ""
  },
  messages: [
    {
      id: "viewer-1",
      speaker: "viewer",
      text: "hey wyd",
      typingSpeedLevel: 3,
      pauseAfterMs: 1000,
      useDefaultTypingMs: true,
      useDefaultPauseAfterMs: true
    }
  ]
};

function cleanText(value: unknown, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function cleanEditableText(value: unknown, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }

  return value;
}

function cleanRequiredEditableText(value: unknown, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }

  return value;
}

function clampNumber(value: unknown, fallback: number, min: number, max: number) {
  const parsed =
    typeof value === "number" ? value : Number.parseInt(String(value), 10);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.round(parsed)));
}

export function normalizeSpeedLevel(
  value: unknown,
  fallback: SpeedLevel = 3
): SpeedLevel {
  const parsed =
    typeof value === "number" ? value : Number.parseInt(String(value), 10);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(5, Math.max(1, Math.round(parsed))) as SpeedLevel;
}

function nearestSpeedLevelFromMs(
  value: unknown,
  presets: readonly number[],
  fallback: SpeedLevel
): SpeedLevel {
  const parsed =
    typeof value === "number" ? value : Number.parseInt(String(value), 10);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  let nearestLevel = fallback;
  let smallestDelta = Number.POSITIVE_INFINITY;

  for (let level = 1; level <= 5; level += 1) {
    const delta = Math.abs(parsed - presets[level]);

    if (delta < smallestDelta) {
      smallestDelta = delta;
      nearestLevel = level as SpeedLevel;
    }
  }

  return nearestLevel;
}

function legacyMessageSpeedLevel(
  message: ConversationMessageInput,
  speaker: SpeakerId,
  text: string,
  fallback: SpeedLevel
): SpeedLevel {
  if (message.typingMs === undefined) {
    return fallback;
  }

  if (speaker === "viewer") {
    return nearestSpeedLevelFromMs(
      message.typingMs,
      SPEAKER_TYPING_DURATION_MS,
      fallback
    );
  }

  const parsed =
    typeof message.typingMs === "number"
      ? message.typingMs
      : Number.parseInt(String(message.typingMs), 10);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return nearestSpeedLevelFromMs(
    Math.round(parsed / Math.max(text.length, 1)),
    POV_TYPING_SPEED_MS_PER_CHARACTER,
    fallback
  );
}

export function getPovTypingMsPerCharacter(level: unknown): number {
  return POV_TYPING_SPEED_MS_PER_CHARACTER[normalizeSpeedLevel(level)];
}

export function getSpeakerTypingDurationMs(
  level: unknown,
  characterCount = 0
): number {
  const baseDuration = SPEAKER_TYPING_DURATION_MS[normalizeSpeedLevel(level)];
  const extraCharacters = Math.max(
    0,
    characterCount - SPEAKER_TYPING_REFERENCE_CHARACTERS
  );
  const extraDuration = Math.round(
    (extraCharacters / SPEAKER_TYPING_EXTRA_CHARACTERS_PER_BASE_DURATION) *
      baseDuration
  );

  return Math.min(
    baseDuration * SPEAKER_TYPING_MAX_MULTIPLIER,
    baseDuration + extraDuration
  );
}

function initialsFromName(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function cleanInitials(
  value: unknown,
  name: string,
  fallback: string
): string {
  const derivedInitials = initialsFromName(name);

  if (typeof value === "string") {
    const trimmed = value.trim();

    return trimmed.length > 0 ? trimmed : derivedInitials;
  }

  return derivedInitials || fallback;
}

function normalizeProfileStatus(value: unknown, fallback = "online now") {
  if (typeof value !== "string") {
    return fallback;
  }

  const normalizedValue = value.trim().toLowerCase();

  if (normalizedValue === "online" || normalizedValue === "online now") {
    return "online now";
  }

  if (normalizedValue === "busy" || normalizedValue === "away") {
    return normalizedValue;
  }

  return fallback;
}

function normalizeSpeaker(value: unknown, index: number): SpeakerId {
  if (value === "viewer" || value === "contact") {
    return value;
  }

  return index % 2 === 0 ? "viewer" : "contact";
}

function normalizeUseDefaultTypingMs(
  value: unknown
): boolean {
  return typeof value === "boolean" ? value : true;
}

function normalizeUseDefaultPauseAfterMs(value: unknown): boolean {
  return typeof value === "boolean" ? value : true;
}

export function normalizeConversationConfig(
  input: ConversationConfigInput
): ConversationConfig {
  const contactName = cleanRequiredEditableText(
    input.contact?.name,
    fallbackConfig.contact.name
  );
  const viewerName = cleanRequiredEditableText(
    input.viewer?.name,
    fallbackConfig.viewer.name
  );
  const contactStatus = normalizeProfileStatus(
    input.contact?.status,
    fallbackConfig.contact.status
  );
  const viewerStatusFallback = contactStatus || fallbackConfig.viewer.status;
  const defaultSpeakerTypingSpeedLevel = normalizeSpeedLevel(
    input.defaultSpeakerTypingSpeedLevel,
    nearestSpeedLevelFromMs(
      input.defaultContactTypingMs,
      SPEAKER_TYPING_DURATION_MS,
      fallbackConfig.defaultSpeakerTypingSpeedLevel
    )
  );
  const defaultPauseAfterMs = clampNumber(
    input.defaultPauseAfterMs,
    fallbackConfig.defaultPauseAfterMs,
    MIN_PAUSE_MS,
    MAX_PAUSE_MS
  );
  const contactTypingSpeedLevel = normalizeSpeedLevel(
    input.contact?.typingSpeedLevel ?? input.viewer?.typingSpeedLevel,
    nearestSpeedLevelFromMs(
      input.contact?.typingSpeedMsPerCharacter ??
        input.viewer?.typingSpeedMsPerCharacter,
      POV_TYPING_SPEED_MS_PER_CHARACTER,
      fallbackConfig.contact.typingSpeedLevel
    )
  );

  const sourceMessages =
    Array.isArray(input.messages) && input.messages.length > 0
      ? input.messages
      : fallbackConfig.messages;
  const cappedMessages = sourceMessages.slice(0, SCENE_MESSAGE_MAX_COUNT);

  return {
    sceneTitle: cleanRequiredEditableText(
      input.sceneTitle,
      fallbackConfig.sceneTitle
    ),
    defaultSpeakerTypingSpeedLevel,
    defaultPauseAfterMs,
    contact: {
      name: contactName,
      initials: cleanInitials(
        input.contact?.initials,
        contactName,
        fallbackConfig.contact.initials
      ),
      status: contactStatus,
      avatarUrl: cleanText(input.contact?.avatarUrl, fallbackConfig.contact.avatarUrl),
      typingSpeedLevel: contactTypingSpeedLevel
    },
    viewer: {
      name: viewerName,
      initials: cleanInitials(
        input.viewer?.initials,
        viewerName,
        fallbackConfig.viewer.initials
      ),
      status: normalizeProfileStatus(input.viewer?.status, viewerStatusFallback),
      avatarUrl: cleanText(input.viewer?.avatarUrl, fallbackConfig.viewer.avatarUrl)
    },
    messages: cappedMessages.map((message, index) => {
      const speaker = normalizeSpeaker(message.speaker, index);
      const text = cleanEditableText(message.text, "message");
      const defaultTypingSpeedLevel =
        speaker === "viewer"
          ? defaultSpeakerTypingSpeedLevel
          : contactTypingSpeedLevel;
      const legacyTypingSpeedLevel = legacyMessageSpeedLevel(
        message,
        speaker,
        text,
        defaultTypingSpeedLevel
      );

      return {
        id: cleanText(message.id, `message-${index + 1}`),
        speaker,
        text,
        typingSpeedLevel: normalizeSpeedLevel(
          message.typingSpeedLevel,
          legacyTypingSpeedLevel
        ),
        pauseAfterMs: clampNumber(
          message.pauseAfterMs,
          defaultPauseAfterMs,
          MIN_PAUSE_MS,
          MAX_PAUSE_MS
        ),
        useDefaultTypingMs: normalizeUseDefaultTypingMs(
          message.useDefaultTypingMs
        ),
        useDefaultPauseAfterMs: normalizeUseDefaultPauseAfterMs(
          message.useDefaultPauseAfterMs
        )
      };
    })
  };
}

function getSceneTitle(index: number): string {
  return `Scene ${index + 1}`;
}

function getStoryTitle(index: number): string {
  return index === 0 ? "Story" : `Story ${index + 1}`;
}

function cleanStoryTitle(value: unknown, index: number): string {
  const fallback = getStoryTitle(index);

  if (typeof value !== "string") {
    return fallback;
  }

  const trimmed = value.trim();
  const oldGeneratedTitles = [
    `Scene ${index + 1}`,
    `Untitled Story ${index + 1}`
  ];

  if (trimmed.length === 0) {
    return "";
  }

  return oldGeneratedTitles.includes(trimmed) ? fallback : value;
}

function normalizePresentationMode(value: unknown): PresentationMode {
  return value === "battle" ? "battle" : "phone";
}

function createBlankMessage(index: number): ConversationMessageInput {
  return {
    id: `viewer-${index + 1}`,
    speaker: "viewer",
    text: "",
    typingSpeedLevel: 3,
    pauseAfterMs: 1000,
    useDefaultTypingMs: true,
    useDefaultPauseAfterMs: true
  };
}

function createBlankSceneInput(
  index: number,
  profileSource?: ConversationConfig
): StorySceneInput {
  return {
    id: `scene-${index + 1}`,
    sceneTitle: getSceneTitle(index),
    defaultSpeakerTypingSpeedLevel:
      profileSource?.defaultSpeakerTypingSpeedLevel ??
      fallbackConfig.defaultSpeakerTypingSpeedLevel,
    defaultPauseAfterMs:
      profileSource?.defaultPauseAfterMs ?? fallbackConfig.defaultPauseAfterMs,
    contact: profileSource?.contact ?? fallbackConfig.contact,
    viewer: profileSource?.viewer ?? fallbackConfig.viewer,
    messages: [createBlankMessage(index)]
  };
}

function normalizeStoryScene(
  input: StorySceneInput | undefined,
  index: number,
  profileSource?: ConversationConfig
): StoryScene {
  const blankScene = createBlankSceneInput(index, profileSource);
  const source = input ?? blankScene;
  const normalizedConfig = normalizeConversationConfig({
    ...blankScene,
    ...source,
    contact: {
      ...blankScene.contact,
      ...source.contact
    },
    viewer: {
      ...blankScene.viewer,
      ...source.viewer
    },
    messages:
      Array.isArray(source.messages) && source.messages.length > 0
        ? source.messages
        : blankScene.messages
  });

  return {
    id: cleanText(source.id, `scene-${index + 1}`),
    ...(source.createdByUser === true ? { createdByUser: true } : {}),
    ...normalizedConfig
  };
}

function getStorySceneInputs(input: StoryDatabaseInput): StorySceneInput[] {
  return Array.isArray(input.scenes)
    ? (input.scenes as StorySceneInput[])
    : [input as StorySceneInput];
}

function isLegacyGeneratedBlankScene(
  input: StorySceneInput | undefined,
  index: number
): boolean {
  if (!input || input.createdByUser === true) {
    return false;
  }

  const messages = Array.isArray(input.messages) ? input.messages : [];
  const onlyMessage = messages.length === 1 ? messages[0] : undefined;

  return (
    input.id === `scene-${index + 1}` &&
    input.sceneTitle === getSceneTitle(index) &&
    onlyMessage?.id === `viewer-${index + 1}` &&
    onlyMessage.speaker === "viewer" &&
    onlyMessage.text === ""
  );
}

function trimLegacyGeneratedScenes(
  sourceScenes: StorySceneInput[]
): StorySceneInput[] {
  if (sourceScenes.length < MAX_STORY_SCENE_COUNT) {
    return sourceScenes;
  }

  let sceneCount = sourceScenes.length;

  while (
    sceneCount > 1 &&
    isLegacyGeneratedBlankScene(sourceScenes[sceneCount - 1], sceneCount - 1)
  ) {
    sceneCount -= 1;
  }

  return sourceScenes.slice(0, sceneCount);
}

export function normalizeStoryDatabase(
  input: StoryDatabaseInput | ConversationConfigInput
): StoryDatabase {
  const storyInput = input as StoryDatabaseInput;
  const sourceScenes = trimLegacyGeneratedScenes(
    getStorySceneInputs(storyInput).slice(0, MAX_STORY_SCENE_COUNT)
  );
  const firstSceneProfile = normalizeConversationConfig(
    sourceScenes[0] ?? fallbackConfig
  );
  const sceneCount = Math.max(1, sourceScenes.length);
  const scenes = Array.from({ length: sceneCount }, (_, index) =>
    normalizeStoryScene(sourceScenes[index], index, firstSceneProfile)
  );
  const requestedActiveSceneId =
    typeof storyInput.activeSceneId === "string"
      ? storyInput.activeSceneId
      : scenes[0].id;
  const activeScene = scenes.find(
    (scene) => scene.id === requestedActiveSceneId
  );

  return {
    activeSceneId: activeScene?.id ?? scenes[0].id,
    scenes
  };
}

export function getActiveStoryScene(story: StoryDatabase): StoryScene {
  return (
    story.scenes.find((scene) => scene.id === story.activeSceneId) ??
    story.scenes[0]
  );
}

function normalizeTimestamp(value: unknown): string {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : DEFAULT_TIMESTAMP;
}

// The crafted showcase story keeps its hand-picked portraits. Every other
// story stores empty avatars and therefore falls back to the generic
// placeholder. This is keyed on the story id because that is the only marker
// shared by both the local seed and the API-hydrated payloads.
export const CRAFTED_SEED_STORY_ID = "story-phil-1";

function applyCraftedAvatarDefaults(
  scenes: StoryScene[],
  storyId: string
): StoryScene[] {
  if (storyId !== CRAFTED_SEED_STORY_ID) {
    return scenes;
  }

  return scenes.map((scene) => ({
    ...scene,
    contact: {
      ...scene.contact,
      avatarUrl: scene.contact.avatarUrl || mayaAnimeAvatar
    },
    viewer: {
      ...scene.viewer,
      avatarUrl: scene.viewer.avatarUrl || mysterySpeakerAvatar
    }
  }));
}

export function normalizeStoryboard(
  input: StoryboardInput | StoryDatabaseInput | ConversationConfigInput,
  index = 0
): Storyboard {
  const story = normalizeStoryDatabase(input);
  const source = input as StoryboardInput;
  const id = cleanText(source.id, `story-${index + 1}`);

  return {
    ...story,
    scenes: applyCraftedAvatarDefaults(story.scenes, id),
    createdAt: normalizeTimestamp(source.createdAt),
    id,
    presentationMode: normalizePresentationMode(source.presentationMode),
    title: cleanStoryTitle(source.title, index),
    updatedAt: normalizeTimestamp(source.updatedAt)
  };
}

export function normalizeStoryLibrary(
  input: StoryLibraryInput | StoryDatabaseInput | ConversationConfigInput
): StoryLibrary {
  const libraryInput = input as StoryLibraryInput;
  const sourceStories = Array.isArray(libraryInput.stories)
    ? (libraryInput.stories as StoryboardInput[])
    : [input as StoryDatabaseInput];
  const stories =
    sourceStories.length > 0
      ? sourceStories.map((story, index) => normalizeStoryboard(story, index))
      : [normalizeStoryboard(fallbackConfig, 0)];
  const requestedActiveStoryId =
    typeof libraryInput.activeStoryId === "string"
      ? libraryInput.activeStoryId
      : stories[0].id;
  const activeStory = stories.find(
    (story) => story.id === requestedActiveStoryId
  );

  return {
    activeStoryId: activeStory?.id ?? stories[0].id,
    stories
  };
}

export function getActiveStoryboard(library: StoryLibrary): Storyboard {
  return (
    library.stories.find((story) => story.id === library.activeStoryId) ??
    library.stories[0]
  );
}

export const defaultStoryDatabase = normalizeStoryDatabase(storyDatabase);

export const defaultStoryLibrary = normalizeStoryLibrary(storyDatabase);

export const defaultConversationConfig =
  getActiveStoryScene(getActiveStoryboard(defaultStoryLibrary));

export function cloneConversationConfig(
  config: ConversationConfig
): ConversationConfig {
  return JSON.parse(JSON.stringify(config)) as ConversationConfig;
}

export function cloneStoryDatabase(story: StoryDatabase): StoryDatabase {
  return JSON.parse(JSON.stringify(story)) as StoryDatabase;
}

export function cloneStoryLibrary(library: StoryLibrary): StoryLibrary {
  return JSON.parse(JSON.stringify(library)) as StoryLibrary;
}

export function createBlankStoryboard(index: number): Storyboard {
  return normalizeStoryboard(
    {
      ...createBlankSceneInput(0),
      activeSceneId: "scene-1",
      id: `story-${index + 1}`,
      scenes: [createBlankSceneInput(0)],
      title: getStoryTitle(index)
    },
    index
  );
}

export function addStoryScene(story: StoryDatabase): StoryDatabase {
  const normalizedStory = normalizeStoryDatabase(story);

  if (normalizedStory.scenes.length >= MAX_STORY_SCENE_COUNT) {
    return normalizedStory;
  }

  const nextScene = createBlankSceneInput(
    normalizedStory.scenes.length,
    getActiveStoryScene(normalizedStory)
  );

  return normalizeStoryDatabase({
    ...normalizedStory,
    activeSceneId: nextScene.id,
    scenes: [...normalizedStory.scenes, { ...nextScene, createdByUser: true }]
  });
}

export function removeStoryboard(
  library: StoryLibrary,
  storyId: string
): StoryLibrary {
  const remainingStories = library.stories.filter((story) => story.id !== storyId);
  const stories =
    remainingStories.length > 0 ? remainingStories : [createBlankStoryboard(0)];
  const removedIndex = library.stories.findIndex((story) => story.id === storyId);
  const fallbackIndex = Math.max(0, Math.min(removedIndex, stories.length - 1));
  const activeStoryId =
    library.activeStoryId === storyId
      ? stories[fallbackIndex].id
      : library.activeStoryId;

  return normalizeStoryLibrary({
    activeStoryId,
    stories
  });
}

export function updateActiveStoryboard(
  library: StoryLibrary,
  story: Storyboard
): StoryLibrary {
  return normalizeStoryLibrary({
    ...library,
    stories: library.stories.map((currentStory) =>
      currentStory.id === library.activeStoryId ? story : currentStory
    )
  });
}

export function updateStoryScene(
  story: StoryDatabase,
  sceneId: string,
  config: ConversationConfig
): StoryDatabase {
  return normalizeStoryDatabase({
    ...story,
    scenes: story.scenes.map((scene) =>
      scene.id === sceneId ? { ...scene, ...config, id: scene.id } : scene
    )
  });
}

export function updateConversationMessage(
  config: ConversationConfig,
  messageId: string,
  patch: Partial<ConversationMessage>
): ConversationConfig {
  return normalizeConversationConfig({
    ...config,
    messages: config.messages.map((message) =>
      message.id === messageId ? { ...message, ...patch } : message
    )
  });
}

export function addConversationMessage(
  config: ConversationConfig
): ConversationConfig {
  if (config.messages.length >= SCENE_MESSAGE_MAX_COUNT) {
    return config;
  }

  const lastMessage = config.messages[config.messages.length - 1];
  const speaker: SpeakerId = lastMessage?.speaker === "viewer" ? "contact" : "viewer";
  const messageNumber = config.messages.length + 1;

  return normalizeConversationConfig({
    ...config,
    messages: [
      ...config.messages,
      {
        id: `${speaker}-${messageNumber}`,
        speaker,
        text: speaker === "viewer" ? "new message" : "new reply",
        typingSpeedLevel:
          speaker === "viewer"
            ? config.defaultSpeakerTypingSpeedLevel
            : config.contact.typingSpeedLevel,
        pauseAfterMs: config.defaultPauseAfterMs,
        useDefaultTypingMs: true,
        useDefaultPauseAfterMs: true
      }
    ]
  });
}

export function removeConversationMessage(
  config: ConversationConfig,
  messageId: string
): ConversationConfig {
  const messages = config.messages.filter((message) => message.id !== messageId);
  return normalizeConversationConfig({
    ...config,
    messages: messages.length > 0 ? messages : fallbackConfig.messages
  });
}

export function loadConversationConfig(): ConversationConfig {
  return getActiveStoryScene(getActiveStoryboard(loadStoryLibrary()));
}

export function loadStoryDatabase(): StoryDatabase {
  return getActiveStoryboard(loadStoryLibrary());
}

export function loadStoryLibrary(): StoryLibrary {
  if (typeof window === "undefined") {
    return cloneStoryLibrary(defaultStoryLibrary);
  }

  const storedValue = window.localStorage.getItem(CONVERSATION_STORAGE_KEY);

  if (!storedValue) {
    return cloneStoryLibrary(defaultStoryLibrary);
  }

  try {
    return normalizeStoryLibrary(JSON.parse(storedValue));
  } catch {
    return cloneStoryLibrary(defaultStoryLibrary);
  }
}

export function saveConversationConfig(config: ConversationConfig) {
  saveStoryLibrary(normalizeStoryLibrary(config));
}

export function saveStoryDatabase(story: StoryDatabase) {
  saveStoryLibrary(normalizeStoryLibrary(story));
}

export function saveStoryLibrary(library: StoryLibrary) {
  window.localStorage.setItem(
    CONVERSATION_STORAGE_KEY,
    JSON.stringify(normalizeStoryLibrary(library))
  );
}

export function rememberEditorUnlock(now = Date.now()) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(EDITOR_UNLOCK_STORAGE_KEY, String(now));
}

export function isEditorUnlockValid(now = Date.now()): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  const storedValue = window.localStorage.getItem(EDITOR_UNLOCK_STORAGE_KEY);
  const unlockedAt = Number.parseInt(String(storedValue), 10);

  if (!Number.isFinite(unlockedAt)) {
    return false;
  }

  const ageMs = now - unlockedAt;
  return ageMs >= 0 && ageMs <= EDITOR_UNLOCK_TTL_MS;
}
