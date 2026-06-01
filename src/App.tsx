import { useEffect, useState, type FormEvent } from "react";
import {
  BookOpen,
  Check,
  ChevronLeft,
  Compass,
  Edit3,
  Home,
  LogIn,
  LogOut,
  Plus,
  Search,
  Settings,
  SquarePen,
  Trash2,
  UserCircle,
  UserPlus,
  X
} from "lucide-react";
import {
  createStory as createRemoteStory,
  deleteStory as deleteRemoteStory,
  fetchProfiles,
  fetchSession,
  fetchStory,
  login,
  logout,
  register,
  updateStory as updateRemoteStory
} from "./api/storyApi";
import { AnimatedComposer } from "./components/AnimatedComposer";
import { ChatHeader } from "./components/ChatHeader";
import { LandingPage } from "./components/LandingPage";
import { MessageList } from "./components/MessageList";
import { PhoneShell } from "./components/PhoneShell";
import { ScriptEditor } from "./components/ScriptEditor";
import { StoryControls } from "./components/StoryControls";
import {
  addStoryScene,
  EDITOR_REQUIRES_PASSWORD,
  getActiveStoryScene,
  normalizeStoryboard,
  SHOW_SCRIPT_EDITOR,
  updateStoryScene,
  type ConversationConfig,
  type Storyboard
} from "./data/conversationConfig";
import {
  getSeedStoryRecord,
  seedProfiles,
  seedStoryRecords,
  type PlatformProfile,
  type PlatformSession,
  type PlatformStoryCard,
  type PlatformStoryRecord
} from "./data/platformSeed";
import { useScriptedConversation } from "./hooks/useScriptedConversation";

const STORY_ENTRANCE_MS = 1500;

type AuthMode = "login" | "register";

function cloneStoryRecord(record: PlatformStoryRecord): PlatformStoryRecord {
  return JSON.parse(JSON.stringify(record)) as PlatformStoryRecord;
}

function toStoryRecordMap(records: PlatformStoryRecord[]) {
  return Object.fromEntries(records.map((record) => [record.id, record]));
}

function toStoryCard(record: PlatformStoryRecord): PlatformStoryCard {
  return {
    coverColor: record.coverColor,
    ownerId: record.ownerId,
    sceneCount: record.storyboard.scenes.length,
    storyId: record.id,
    title: record.title,
    updatedAt: record.updatedAt
  };
}

function upsertProfileStory(
  profiles: PlatformProfile[],
  record: PlatformStoryRecord,
  session: PlatformSession | null
): PlatformProfile[] {
  const card = toStoryCard(record);
  const profileIndex = profiles.findIndex((profile) => profile.id === record.ownerId);

  if (profileIndex === -1 && session?.user.id === record.ownerId) {
    return [
      ...profiles,
      {
        accentColor: record.coverColor,
        displayName: session.user.displayName,
        id: session.user.id,
        stories: [card],
        username: session.user.username
      }
    ];
  }

  return profiles.map((profile, index) => {
    if (index !== profileIndex) {
      return profile;
    }

    const stories = profile.stories.some((story) => story.storyId === record.id)
      ? profile.stories.map((story) => (story.storyId === record.id ? card : story))
      : [...profile.stories, card];

    return {
      ...profile,
      stories
    };
  });
}

function removeProfileStory(
  profiles: PlatformProfile[],
  ownerId: string,
  storyId: string
) {
  return profiles.map((profile) =>
    profile.id === ownerId
      ? {
          ...profile,
          stories: profile.stories.filter((story) => story.storyId !== storyId)
        }
      : profile
  );
}

function getStoryCard(
  profiles: PlatformProfile[],
  storyId: string
): PlatformStoryCard | null {
  for (const profile of profiles) {
    const story = profile.stories.find((card) => card.storyId === storyId);

    if (story) {
      return story;
    }
  }

  return null;
}

function createPlaceholderRecord(card: PlatformStoryCard): PlatformStoryRecord {
  const seed = getSeedStoryRecord();
  const storyboard = normalizeStoryboard({
    ...seed.storyboard,
    id: card.storyId,
    title: card.title
  });

  return {
    ...seed,
    coverColor: card.coverColor,
    id: card.storyId,
    ownerId: card.ownerId,
    storyboard,
    title: card.title,
    updatedAt: card.updatedAt
  };
}

function canManageStory(
  session: PlatformSession | null,
  record: PlatformStoryRecord
) {
  return (
    session?.user.role === "admin" || session?.user.id === record.ownerId
  );
}

export default function App() {
  const [profiles, setProfiles] = useState<PlatformProfile[]>(seedProfiles);
  const [session, setSession] = useState<PlatformSession | null>(null);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(
    null
  );
  const [storyRecordsById, setStoryRecordsById] = useState<
    Record<string, PlatformStoryRecord>
  >(() => toStoryRecordMap(seedStoryRecords));
  const [activeStoryId, setActiveStoryId] = useState("story-phil-1");
  const [undoStack, setUndoStack] = useState<PlatformStoryRecord[]>([]);
  const [isStoryListOpen, setIsStoryListOpen] = useState(true);
  const [isStoryEntranceVisible, setIsStoryEntranceVisible] = useState(false);
  const [isConversationIntroComplete, setIsConversationIntroComplete] =
    useState(false);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isStorybookOpen, setIsStorybookOpen] = useState(false);
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [accountError, setAccountError] = useState("");
  const [pendingDeleteStoryId, setPendingDeleteStoryId] = useState<
    string | null
  >(null);
  const [avatarPreview, setAvatarPreview] = useState<{
    avatarUrl: string;
    initials: string;
    name: string;
  } | null>(null);
  const activeStoryRecord =
    storyRecordsById[activeStoryId] ?? getSeedStoryRecord(activeStoryId);
  const story = activeStoryRecord.storyboard;
  const config = getActiveStoryScene(story);
  const activeProfile = profiles.find(
    (profile) => profile.id === activeStoryRecord.ownerId
  );
  const selectedProfile =
    profiles.find((profile) => profile.id === selectedProfileId) ?? null;
  const activeOwnerStories = activeProfile?.stories ?? [toStoryCard(activeStoryRecord)];
  const canEditActiveStory =
    SHOW_SCRIPT_EDITOR && canManageStory(session, activeStoryRecord);

  useEffect(() => {
    let isCancelled = false;

    async function hydratePlatform() {
      const [profilesResult, sessionResult] = await Promise.allSettled([
        fetchProfiles(),
        fetchSession()
      ]);

      if (isCancelled) {
        return;
      }

      if (profilesResult.status === "fulfilled") {
        setProfiles(profilesResult.value);
      }

      if (sessionResult.status === "fulfilled") {
        setSession(sessionResult.value);
      }
    }

    void hydratePlatform();

    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    if (isStoryListOpen) {
      setIsStoryEntranceVisible(false);
      setIsConversationIntroComplete(false);
      return undefined;
    }

    setIsStoryEntranceVisible(false);
    setIsConversationIntroComplete(false);

    const showEntranceTimer = window.setTimeout(() => {
      setIsStoryEntranceVisible(true);
    }, 0);
    const startPlaybackTimer = window.setTimeout(() => {
      setIsConversationIntroComplete(true);
    }, STORY_ENTRANCE_MS);

    return () => {
      window.clearTimeout(showEntranceTimer);
      window.clearTimeout(startPlaybackTimer);
    };
  }, [isStoryListOpen, activeStoryId]);

  useEffect(() => {
    if (!avatarPreview) {
      return undefined;
    }

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setAvatarPreview(null);
      }
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [avatarPreview]);

  const upsertStoryRecord = (record: PlatformStoryRecord) => {
    setStoryRecordsById((currentRecords) => ({
      ...currentRecords,
      [record.id]: record
    }));
    setProfiles((currentProfiles) =>
      upsertProfileStory(currentProfiles, record, session)
    );
  };

  const persistStoryRecord = (record: PlatformStoryRecord) => {
    if (!canEditActiveStory) {
      return;
    }

    void updateRemoteStory(record.id, record)
      .then(upsertStoryRecord)
      .catch(() => undefined);
  };

  const commitActiveStory = (
    nextRecord: PlatformStoryRecord,
    options: { persist?: boolean; undo?: boolean } = {}
  ) => {
    const { persist = true, undo = true } = options;

    if (undo) {
      setUndoStack((currentStack) => [
        cloneStoryRecord(activeStoryRecord),
        ...currentStack
      ].slice(0, 5));
    }

    upsertStoryRecord(nextRecord);

    if (persist) {
      persistStoryRecord(nextRecord);
    }
  };

  const updateConfig = (nextConfig: ConversationConfig) => {
    const updatedAt = new Date().toISOString();
    const updatedStoryboard: Storyboard = {
      ...story,
      ...updateStoryScene(story, story.activeSceneId, nextConfig),
      updatedAt
    };

    commitActiveStory({
      ...activeStoryRecord,
      storyboard: updatedStoryboard,
      updatedAt
    });
  };

  const updateStoryTitle = (title: string) => {
    const updatedAt = new Date().toISOString();
    const updatedStoryboard: Storyboard = {
      ...story,
      title,
      updatedAt
    };

    commitActiveStory({
      ...activeStoryRecord,
      storyboard: updatedStoryboard,
      title,
      updatedAt
    });
  };

  const beginStoryEntrance = () => {
    setIsStoryEntranceVisible(false);
    setIsConversationIntroComplete(false);
  };

  const selectScene = (sceneId: string) => {
    const updatedStoryboard = normalizeStoryboard({
      ...story,
      activeSceneId: sceneId
    });

    commitActiveStory(
      {
        ...activeStoryRecord,
        storyboard: updatedStoryboard
      },
      { persist: false, undo: false }
    );
  };

  const selectStory = (storyId: string) => {
    const knownRecord = storyRecordsById[storyId];
    const card = getStoryCard(profiles, storyId);

    beginStoryEntrance();
    setActiveStoryId(storyId);
    setSelectedProfileId(knownRecord?.ownerId ?? card?.ownerId ?? null);
    setPendingDeleteStoryId(null);
    setIsStorybookOpen(false);
    setIsEditorOpen(false);
    setIsAccountOpen(false);
    setIsStoryListOpen(false);

    if (!knownRecord) {
      if (card) {
        upsertStoryRecord(createPlaceholderRecord(card));
      }
    }

    void fetchStory(storyId)
      .then((record) => {
        upsertStoryRecord(record);
        setActiveStoryId(record.id);
      })
      .catch(() => undefined);
  };

  const editStory = (storyId: string) => {
    selectStory(storyId);
    setIsEditorOpen(true);
  };

  const deleteStory = (storyId: string) => {
    const record = storyRecordsById[storyId] ?? activeStoryRecord;

    void deleteRemoteStory(storyId)
      .catch(() => undefined)
      .then(() => {
        setProfiles((currentProfiles) =>
          removeProfileStory(currentProfiles, record.ownerId, storyId)
        );
        setStoryRecordsById((currentRecords) => {
          const nextRecords = { ...currentRecords };
          delete nextRecords[storyId];
          return nextRecords;
        });
        setPendingDeleteStoryId(null);

        if (storyId === activeStoryId) {
          const fallbackStory = activeOwnerStories.find(
            (storyCard) => storyCard.storyId !== storyId
          );

          if (fallbackStory) {
            selectStory(fallbackStory.storyId);
          } else {
            beginStoryEntrance();
            setSelectedProfileId(null);
            setIsStoryListOpen(true);
          }
        }
      });
  };

  const createStory = async () => {
    const nextStory = await createRemoteStory();

    upsertStoryRecord(nextStory);
    beginStoryEntrance();
    setActiveStoryId(nextStory.id);
    setSelectedProfileId(nextStory.ownerId);
    setPendingDeleteStoryId(null);
    setIsStorybookOpen(false);
    setIsEditorOpen(false);
    setIsAccountOpen(false);
    setIsStoryListOpen(false);
  };

  const addScene = () => {
    const updatedAt = new Date().toISOString();
    const updatedStoryboard: Storyboard = {
      ...story,
      ...addStoryScene(story),
      updatedAt
    };

    commitActiveStory({
      ...activeStoryRecord,
      storyboard: updatedStoryboard,
      updatedAt
    });
  };

  const undoLastEdit = () => {
    setUndoStack((currentStack) => {
      const [previousRecord, ...nextStack] = currentStack;

      if (!previousRecord) {
        return currentStack;
      }

      upsertStoryRecord(previousRecord);
      persistStoryRecord(previousRecord);
      return nextStack;
    });
  };

  const handleLogin = async (input: { password: string; username: string }) => {
    const nextSession = await login(input);
    setSession(nextSession);
    const nextProfiles = await fetchProfiles();
    setProfiles(nextProfiles);
  };

  const handleRegister = async (input: {
    displayName: string;
    password: string;
    username: string;
  }) => {
    const nextSession = await register(input);
    setSession(nextSession);
    const nextProfiles = await fetchProfiles();
    setProfiles(nextProfiles);
  };

  const handleLogout = async () => {
    await logout();
    setSession(null);
    setIsEditorOpen(false);
    setIsStorybookOpen(false);
    const nextProfiles = await fetchProfiles();
    setProfiles(nextProfiles);
  };

  const submitAuth = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsBusy(true);
    setAccountError("");

    try {
      if (authMode === "register") {
        await handleRegister({ displayName, password, username });
      } else {
        await handleLogin({ password, username });
      }

      setPassword("");
      setIsAccountOpen(false);
    } catch (error) {
      setAccountError(
        error instanceof Error ? error.message : "Account request failed."
      );
    } finally {
      setIsBusy(false);
    }
  };

  const createStoryFromShell = async () => {
    setAccountError("");

    if (!session) {
      setAuthMode("login");
      setIsAccountOpen(true);
      setAccountError("Sign in to create stories.");
      return;
    }

    setIsBusy(true);

    try {
      await createStory();
    } catch (error) {
      setAccountError(
        error instanceof Error ? error.message : "Could not create story."
      );
      setIsAccountOpen(true);
    } finally {
      setIsBusy(false);
    }
  };

  const logoutFromShell = async () => {
    setIsBusy(true);
    setAccountError("");

    try {
      await handleLogout();
      setIsAccountOpen(false);
    } catch (error) {
      setAccountError(error instanceof Error ? error.message : "Logout failed.");
    } finally {
      setIsBusy(false);
    }
  };

  const showHome = () => {
    beginStoryEntrance();
    setIsStoryListOpen(true);
    setSelectedProfileId(null);
    setIsStorybookOpen(false);
    setIsEditorOpen(false);
    setPendingDeleteStoryId(null);
    setIsAccountOpen(false);
  };

  const showActiveProfile = () => {
    beginStoryEntrance();
    setIsStoryListOpen(true);
    setSelectedProfileId(activeProfile?.id ?? selectedProfileId);
    setIsStorybookOpen(false);
    setIsEditorOpen(false);
    setPendingDeleteStoryId(null);
  };

  const conversation = useScriptedConversation(config.messages, {
    autoPlay: isConversationIntroComplete,
    contactName: config.viewer.name,
    defaultSpeakerTypingSpeedLevel: config.defaultSpeakerTypingSpeedLevel,
    defaultPauseAfterMs: config.defaultPauseAfterMs,
    povTypingSpeedLevel: config.contact.typingSpeedLevel
  });
  const visibleMessages = isConversationIntroComplete
    ? conversation.visibleMessages
    : [];
  const draftText = isConversationIntroComplete ? conversation.draftText : "";
  const isContactTyping =
    isConversationIntroComplete && conversation.isContactTyping;
  const isConversationComplete =
    isConversationIntroComplete && conversation.isComplete;
  const hasPlaybackStarted =
    visibleMessages.length > 0 ||
    draftText.length > 0 ||
    isConversationComplete;
  const activeSceneIndex = Math.max(
    0,
    story.scenes.findIndex((scene) => scene.id === story.activeSceneId)
  );
  const nextStoryScene = story.scenes[activeSceneIndex + 1];
  const backgroundModeClass = isStoryListOpen
    ? "app-background--landing"
    : "app-background--story";
  const goToNextScene = () => {
    if (nextStoryScene) {
      selectScene(nextStoryScene.id);
      return;
    }

    conversation.skipToEnd();
  };

  return (
    <div
      aria-label="App shell"
      className={`app-background ${backgroundModeClass} relative min-h-screen overflow-hidden text-slate-950`}
    >
      <nav
        aria-label="Desktop navigation"
        className="fixed inset-y-0 left-0 z-30 hidden w-20 flex-col items-center border-r border-slate-200/80 bg-white/95 py-5 shadow-[8px_0_28px_rgba(15,23,42,0.05)] backdrop-blur-xl md:flex"
      >
        <button
          type="button"
          aria-label="Home"
          title="Home"
          onClick={showHome}
          className="grid h-11 w-11 place-items-center rounded-lg text-rose-600 transition hover:bg-rose-50"
        >
          <Home className="h-6 w-6" aria-hidden="true" />
        </button>
        <div className="mt-8 grid gap-4">
          <button
            type="button"
            aria-label="Explore"
            title="Explore"
            onClick={showHome}
            className="grid h-11 w-11 place-items-center rounded-lg text-slate-800 transition hover:bg-slate-100"
          >
            <Compass className="h-6 w-6" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Create story"
            title="Create story"
            onClick={() => void createStoryFromShell()}
            className="grid h-11 w-11 place-items-center rounded-lg text-slate-800 transition hover:bg-slate-100"
          >
            <Plus className="h-6 w-6" aria-hidden="true" />
          </button>
        </div>
        <button
          type="button"
          aria-label="Account"
          title="Account"
          onClick={() => setIsAccountOpen((isOpen) => !isOpen)}
          className="mt-auto grid h-11 w-11 place-items-center rounded-lg text-slate-800 transition hover:bg-slate-100"
        >
          <UserCircle className="h-6 w-6" aria-hidden="true" />
        </button>
      </nav>

      <div className="sticky top-0 z-20 flex min-h-[72px] items-center gap-2 border-b border-slate-200/80 bg-white/95 px-3 shadow-[0_8px_28px_rgba(15,23,42,0.05)] backdrop-blur-xl md:pl-24 md:pr-5">
        {!isStoryListOpen ? (
          <button
            type="button"
            aria-label="Back to profile"
            title="Back to profile"
            onClick={showActiveProfile}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-slate-800 transition hover:bg-slate-100"
          >
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          </button>
        ) : selectedProfile ? (
          <button
            type="button"
            aria-label="Back to home"
            title="Back to home"
            onClick={showHome}
            className="hidden h-11 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-bold text-slate-800 transition hover:bg-slate-100 sm:inline-flex"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            Home
          </button>
        ) : null}

        <label className="relative flex h-12 min-w-0 flex-1 items-center rounded-lg bg-slate-100 text-slate-600 ring-1 ring-slate-200 transition focus-within:bg-white focus-within:ring-slate-300">
          <span className="sr-only">Search stories</span>
          <Search className="ml-4 h-5 w-5 shrink-0" aria-hidden="true" />
          <input
            aria-label="Search stories"
            type="search"
            className="h-full min-w-0 flex-1 bg-transparent px-3 text-base font-semibold text-slate-900 outline-none placeholder:text-slate-500"
            placeholder="Search"
          />
        </label>

        <div className="relative flex shrink-0 items-center gap-1.5">
          {canEditActiveStory && !isStoryListOpen ? (
            <>
              <div className="relative">
                <button
                  type="button"
                  aria-expanded={isStorybookOpen}
                  aria-label="Open storybook"
                  title="Open storybook"
                  onClick={() => {
                    setPendingDeleteStoryId(null);
                    setIsStorybookOpen((isCurrentlyOpen) => !isCurrentlyOpen);
                    setIsAccountOpen(false);
                  }}
                  className="grid h-11 w-11 place-items-center rounded-lg text-slate-800 transition hover:bg-slate-100"
                >
                  <BookOpen className="h-5 w-5" aria-hidden="true" />
                </button>
                {isStorybookOpen ? (
                  <div
                    role="dialog"
                    aria-label="Storybook"
                    className="absolute right-0 top-14 grid w-72 gap-3 rounded-lg border border-slate-200 bg-white/95 p-3 shadow-2xl backdrop-blur-xl"
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold uppercase text-slate-600">
                        Storybook
                      </p>
                      <button
                        type="button"
                        aria-label="New story"
                        title="New story"
                        onClick={() => void createStoryFromShell()}
                        className="flex h-9 items-center justify-center gap-2 rounded-lg bg-slate-950 px-3 text-xs font-semibold text-white transition hover:bg-slate-800"
                      >
                        <Plus className="h-4 w-4" aria-hidden="true" />
                        New
                      </button>
                    </div>
                    <label className="text-xs font-bold uppercase text-slate-600">
                      Storyboard title
                      <input
                        aria-label="Storyboard title"
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold normal-case text-slate-950 outline-none transition focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
                        value={activeStoryRecord.title}
                        onChange={(event) => updateStoryTitle(event.target.value)}
                      />
                    </label>
                    <div className="grid gap-2">
                      {activeOwnerStories.map((storyItem) => {
                        const isActive = storyItem.storyId === activeStoryId;
                        const isPendingDelete =
                          storyItem.storyId === pendingDeleteStoryId;

                        return (
                          <div
                            key={storyItem.storyId}
                            className={`grid grid-cols-[minmax(0,1fr)_32px_32px] items-center gap-1 rounded-lg p-1 ring-1 transition ${
                              isActive
                                ? "bg-slate-950 text-white ring-slate-950"
                                : "bg-white text-slate-800 ring-slate-200"
                            }`}
                          >
                            <button
                              type="button"
                              aria-label={`Select ${storyItem.title}`}
                              onClick={() => selectStory(storyItem.storyId)}
                              className={`min-w-0 rounded-lg px-2 py-2 text-left text-sm font-semibold transition ${
                                isActive ? "hover:bg-white/10" : "hover:bg-slate-50"
                              }`}
                            >
                              <span className="block truncate">
                                {storyItem.title}
                              </span>
                            </button>
                            {isPendingDelete ? (
                              <>
                                <button
                                  type="button"
                                  aria-label={`Confirm delete ${storyItem.title}`}
                                  title={`Confirm delete ${storyItem.title}`}
                                  onClick={() => deleteStory(storyItem.storyId)}
                                  className={`grid h-8 w-8 place-items-center rounded-lg transition ${
                                    isActive
                                      ? "text-emerald-100 hover:bg-white/10"
                                      : "text-emerald-700 hover:bg-emerald-50"
                                  }`}
                                >
                                  <Check className="h-4 w-4" aria-hidden="true" />
                                </button>
                                <button
                                  type="button"
                                  aria-label={`Cancel delete ${storyItem.title}`}
                                  title={`Cancel delete ${storyItem.title}`}
                                  onClick={() => setPendingDeleteStoryId(null)}
                                  className={`grid h-8 w-8 place-items-center rounded-lg transition ${
                                    isActive
                                      ? "hover:bg-white/10"
                                      : "hover:bg-slate-50"
                                  }`}
                                >
                                  <X className="h-4 w-4" aria-hidden="true" />
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  aria-label={`Edit ${storyItem.title}`}
                                  title={`Edit ${storyItem.title}`}
                                  onClick={() => editStory(storyItem.storyId)}
                                  className={`grid h-8 w-8 place-items-center rounded-lg transition ${
                                    isActive
                                      ? "hover:bg-white/10"
                                      : "hover:bg-slate-50"
                                  }`}
                                >
                                  <Edit3 className="h-4 w-4" aria-hidden="true" />
                                </button>
                                <button
                                  type="button"
                                  aria-label={`Delete ${storyItem.title}`}
                                  title={`Delete ${storyItem.title}`}
                                  onClick={() =>
                                    setPendingDeleteStoryId(storyItem.storyId)
                                  }
                                  className={`grid h-8 w-8 place-items-center rounded-lg transition ${
                                    isActive
                                      ? "text-rose-100 hover:bg-white/10"
                                      : "text-rose-700 hover:bg-rose-50"
                                  }`}
                                >
                                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                                </button>
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                aria-label="Open script editor"
                title="Open script editor"
                onClick={() => setIsEditorOpen(true)}
                className="grid h-11 w-11 place-items-center rounded-lg text-slate-800 transition hover:bg-slate-100"
              >
                <SquarePen className="h-5 w-5" aria-hidden="true" />
              </button>
            </>
          ) : null}
          <button
            type="button"
            aria-label="Account settings"
            title="Account settings"
            onClick={() => {
              setIsAccountOpen((isOpen) => !isOpen);
              setIsStorybookOpen(false);
            }}
            className="grid h-11 w-11 place-items-center rounded-lg text-slate-800 transition hover:bg-slate-100"
          >
            <Settings className="h-5 w-5" aria-hidden="true" />
          </button>

          {isAccountOpen ? (
            <div
              role="dialog"
              aria-label="Account panel"
              className="absolute right-0 top-14 z-40 grid w-[min(340px,calc(100vw-24px))] gap-3 rounded-lg border border-slate-200 bg-white/95 p-4 text-left shadow-2xl backdrop-blur-xl"
            >
              {session ? (
                <>
                  <div>
                    <p className="text-xs font-bold uppercase text-slate-500">
                      Signed in
                    </p>
                    <p className="mt-1 text-base font-extrabold text-slate-950">
                      {session.user.displayName}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void createStoryFromShell()}
                    disabled={isBusy}
                    className="flex h-10 items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Create story
                  </button>
                  <button
                    type="button"
                    onClick={() => void logoutFromShell()}
                    disabled={isBusy}
                    className="flex h-10 items-center justify-center gap-2 rounded-lg bg-white px-4 text-sm font-bold text-slate-800 ring-1 ring-slate-200 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
                  >
                    <LogOut className="h-4 w-4" aria-hidden="true" />
                    Logout
                  </button>
                </>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
                    <button
                      type="button"
                      onClick={() => setAuthMode("login")}
                      className={`h-9 rounded-lg text-sm font-bold transition ${
                        authMode === "login"
                          ? "bg-white text-slate-950 shadow-sm"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      Login
                    </button>
                    <button
                      type="button"
                      onClick={() => setAuthMode("register")}
                      className={`h-9 rounded-lg text-sm font-bold transition ${
                        authMode === "register"
                          ? "bg-white text-slate-950 shadow-sm"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      Create
                    </button>
                  </div>
                  <form className="grid gap-3" onSubmit={submitAuth}>
                    <label className="text-xs font-bold uppercase text-slate-600">
                      Username
                      <input
                        aria-label="Username"
                        value={username}
                        onChange={(event) => setUsername(event.target.value)}
                        className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold normal-case text-slate-950 outline-none transition focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
                      />
                    </label>
                    {authMode === "register" ? (
                      <label className="text-xs font-bold uppercase text-slate-600">
                        Display name
                        <input
                          aria-label="Display name"
                          value={displayName}
                          onChange={(event) => setDisplayName(event.target.value)}
                          className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold normal-case text-slate-950 outline-none transition focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
                        />
                      </label>
                    ) : null}
                    <label className="text-xs font-bold uppercase text-slate-600">
                      Password
                      <input
                        aria-label="Password"
                        type="password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold normal-case text-slate-950 outline-none transition focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
                      />
                    </label>
                    {accountError ? (
                      <p className="text-sm font-semibold text-rose-700">
                        {accountError}
                      </p>
                    ) : null}
                    <button
                      type="submit"
                      disabled={isBusy}
                      className="flex h-10 items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                    >
                      {authMode === "register" ? (
                        <UserPlus className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <LogIn className="h-4 w-4" aria-hidden="true" />
                      )}
                      {authMode === "register" ? "Create account" : "Login"}
                    </button>
                  </form>
                </>
              )}
              {session && accountError ? (
                <p className="text-sm font-semibold text-rose-700">
                  {accountError}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <main className="relative z-10 min-h-[calc(100dvh-72px)] px-3 pb-24 pt-5 md:pl-24 md:pr-6 md:pt-6">
        {isStoryListOpen ? (
          <LandingPage
            onSelectProfile={(profileId) => {
              setSelectedProfileId(profileId);
              setIsStoryListOpen(true);
              setIsAccountOpen(false);
            }}
            onSelectStory={selectStory}
            profiles={profiles}
            selectedProfileId={selectedProfileId}
          />
        ) : (
          <div
            data-testid="story-stage"
            className={`mx-auto flex min-h-[calc(100dvh-132px)] w-full max-w-5xl flex-col items-center justify-center gap-4 transition-all duration-[1500ms] ease-out will-change-transform ${
              isStoryEntranceVisible
                ? "translate-y-0 opacity-100"
                : "translate-y-3 opacity-0"
            } ${isConversationIntroComplete ? "" : "pointer-events-none"}`}
          >
            <PhoneShell>
              <ChatHeader
                avatarUrl={config.viewer.avatarUrl}
                initials={config.viewer.initials}
                name={config.viewer.name}
                onAvatarClick={() =>
                  setAvatarPreview({
                    avatarUrl: config.viewer.avatarUrl,
                    initials: config.viewer.initials,
                    name: config.viewer.name
                  })
                }
                status={config.viewer.status}
              />
              <MessageList
                contactAvatarUrl={config.viewer.avatarUrl}
                contactInitials={config.viewer.initials}
                contactName={config.viewer.name}
                contactStatus={config.viewer.status}
                isContactTyping={isContactTyping}
                messages={visibleMessages}
              />
              <AnimatedComposer
                draftText={draftText}
                povAvatarUrl={config.contact.avatarUrl}
                povInitials={config.contact.initials}
                povName={config.contact.name}
              />
            </PhoneShell>
            <StoryControls
              hasStarted={hasPlaybackStarted}
              isComplete={isConversationComplete}
              isPlaying={isConversationIntroComplete && conversation.isPlaying}
              onNext={goToNextScene}
              onReset={conversation.reset}
              onTogglePlayback={conversation.togglePlayback}
              onToggleSpeed={conversation.togglePlaybackSpeed}
              playbackSpeed={conversation.playbackSpeed}
            />
          </div>
        )}
      </main>

      <nav
        aria-label="Mobile navigation"
        className="fixed inset-x-0 bottom-0 z-30 grid h-20 grid-cols-4 border-t border-slate-200 bg-white/95 px-5 pb-3 pt-2 shadow-[0_-8px_28px_rgba(15,23,42,0.08)] backdrop-blur-xl md:hidden"
      >
        <button
          type="button"
          aria-label="Home"
          onClick={showHome}
          className="grid place-items-center rounded-lg text-slate-900 transition hover:bg-slate-100"
        >
          <Home className="h-7 w-7" aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="Explore"
          onClick={showHome}
          className="grid place-items-center rounded-lg text-slate-700 transition hover:bg-slate-100"
        >
          <Search className="h-7 w-7" aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="Create"
          onClick={() => void createStoryFromShell()}
          className="grid place-items-center rounded-lg text-slate-700 transition hover:bg-slate-100"
        >
          <Plus className="h-7 w-7" aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="Account"
          onClick={() => setIsAccountOpen((isOpen) => !isOpen)}
          className="grid place-items-center rounded-lg text-slate-700 transition hover:bg-slate-100"
        >
          <UserCircle className="h-7 w-7" aria-hidden="true" />
        </button>
      </nav>

      {canEditActiveStory && isEditorOpen ? (
        <ScriptEditor
          activeSceneId={story.activeSceneId}
          canUndo={undoStack.length > 0}
          config={config}
          onChange={updateConfig}
          onClose={() => setIsEditorOpen(false)}
          onSceneAdd={addScene}
          onSceneSelect={selectScene}
          onStoryTitleChange={updateStoryTitle}
          onUndo={undoLastEdit}
          requiresPassword={EDITOR_REQUIRES_PASSWORD}
          scenes={story.scenes}
          storyTitle={activeStoryRecord.title}
        />
      ) : null}

      {avatarPreview ? (
        <div
          role="dialog"
          aria-label={`${avatarPreview.name} avatar preview`}
          className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/75 p-5 backdrop-blur-md"
          onClick={() => setAvatarPreview(null)}
        >
          <div
            className="grid gap-3 rounded-2xl bg-white p-4 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm font-semibold text-slate-950">
                {avatarPreview.name}
              </p>
              <button
                type="button"
                aria-label="Close avatar preview"
                title="Close avatar preview"
                onClick={() => setAvatarPreview(null)}
                className="grid h-9 w-9 place-items-center rounded-full text-slate-600 transition hover:bg-slate-100"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <div className="grid h-[min(640px,calc(100vw-64px))] w-[min(640px,calc(100vw-64px))] place-items-center overflow-hidden rounded-2xl bg-slate-100">
              {avatarPreview.avatarUrl ? (
                <img
                  alt=""
                  className="h-full w-full object-cover"
                  draggable={false}
                  src={avatarPreview.avatarUrl}
                />
              ) : (
                <span className="text-5xl font-semibold text-slate-500">
                  {avatarPreview.initials}
                </span>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
