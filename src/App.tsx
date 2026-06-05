import { useEffect, useRef, useState, type FormEvent } from "react";
import { SquarePen, X } from "lucide-react";
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
import { AccountPanel, type AuthMode } from "./components/AccountPanel";
import { AppShell } from "./components/AppShell";
import { BattleStoryPlayer } from "./components/BattleStoryPlayer";
import { ChatHeader } from "./components/ChatHeader";
import { LandingPage } from "./components/LandingPage";
import { MessageList } from "./components/MessageList";
import { PhoneShell } from "./components/PhoneShell";
import { BattleScriptEditor } from "./components/BattleScriptEditor";
import { ScriptEditor } from "./components/ScriptEditor";
import { StorybookMenu } from "./components/StorybookMenu";
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
import { useAppRoute, type AppRoute } from "./navigation/appRoute";

const STORY_ENTRANCE_MS = 1500;

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

function getRequestErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export default function App() {
  const { navigate, replace, route } = useAppRoute();
  const latestStorySaveRef = useRef<Promise<boolean> | null>(null);
  const storySaveVersionRef = useRef(0);
  const [profiles, setProfiles] = useState<PlatformProfile[]>(seedProfiles);
  const [session, setSession] = useState<PlatformSession | null>(null);
  const [hasHydratedPlatform, setHasHydratedPlatform] = useState(false);
  const [storyRecordsById, setStoryRecordsById] = useState<
    Record<string, PlatformStoryRecord>
  >(() => toStoryRecordMap(seedStoryRecords));
  const [activeStoryId, setActiveStoryId] = useState("story-phil-1");
  const [undoStack, setUndoStack] = useState<PlatformStoryRecord[]>([]);
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
  const [searchQuery, setSearchQuery] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [isStorySaving, setIsStorySaving] = useState(false);
  const [accountError, setAccountError] = useState("");
  const [storyPersistenceError, setStoryPersistenceError] = useState("");
  const [storybookError, setStorybookError] = useState("");
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
  const selectedProfileId = route.name === "profile" ? route.profileId : null;
  const selectedProfile =
    profiles.find((profile) => profile.id === selectedProfileId) ?? null;
  const isStoryListOpen = route.name !== "story";
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

      setHasHydratedPlatform(true);
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
    if (!canManageStory(session, record)) {
      return Promise.resolve(true);
    }

    setStoryPersistenceError("");
    const saveVersion = storySaveVersionRef.current + 1;
    storySaveVersionRef.current = saveVersion;
    setIsStorySaving(true);

    const savePromise = updateRemoteStory(record.id, record)
      .then((savedRecord) => {
        if (storySaveVersionRef.current === saveVersion) {
          upsertStoryRecord(savedRecord);
          setStoryPersistenceError("");
        }

        return true;
      })
      .catch((error) => {
        if (storySaveVersionRef.current === saveVersion) {
          setStoryPersistenceError(
            getRequestErrorMessage(error, "Could not save story.")
          );
        }

        return false;
      })
      .finally(() => {
        if (storySaveVersionRef.current === saveVersion) {
          setIsStorySaving(false);
        }
      });

    latestStorySaveRef.current = savePromise;
    return savePromise;
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
      void persistStoryRecord(nextRecord);
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

  const goToRoute = (
    nextRoute: AppRoute,
    options: { history?: "push" | "replace" | "none" } = {}
  ) => {
    const { history = "push" } = options;

    if (history === "replace") {
      replace(nextRoute);
    } else if (history === "push") {
      navigate(nextRoute);
    }
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

  const selectStory = (
    storyId: string,
    options: { history?: "push" | "replace" | "none" } = {}
  ) => {
    const knownRecord = storyRecordsById[storyId];
    const card = getStoryCard(profiles, storyId);

    beginStoryEntrance();
    setActiveStoryId(storyId);
    setPendingDeleteStoryId(null);
    setIsStorybookOpen(false);
    setIsEditorOpen(false);
    setIsAccountOpen(false);
    setStoryPersistenceError("");
    setStorybookError("");
    goToRoute({ name: "story", storyId }, options);

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
      .catch(() => {
        if (!knownRecord && !card) {
          replace({ name: "home" });
        }
      });
  };

  const editStory = (storyId: string) => {
    selectStory(storyId);
    setIsEditorOpen(true);
  };

  const deleteStory = (storyId: string) => {
    const record = storyRecordsById[storyId] ?? activeStoryRecord;

    setStorybookError("");

    void deleteRemoteStory(storyId)
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
            selectStory(fallbackStory.storyId, { history: "replace" });
          } else {
            beginStoryEntrance();
            if (profiles.some((profile) => profile.id === record.ownerId)) {
              replace({ name: "profile", profileId: record.ownerId });
            } else {
              replace({ name: "home" });
            }
          }
        }
      })
      .catch((error) => {
        setPendingDeleteStoryId(storyId);
        setIsStorybookOpen(true);
        setStorybookError(
          getRequestErrorMessage(error, "Could not delete story.")
        );
      });
  };

  const createStory = async () => {
    const nextStory = await createRemoteStory();

    upsertStoryRecord(nextStory);
    beginStoryEntrance();
    setActiveStoryId(nextStory.id);
    setPendingDeleteStoryId(null);
    setIsStorybookOpen(false);
    setIsEditorOpen(false);
    setIsAccountOpen(false);
    setStoryPersistenceError("");
    setStorybookError("");
    navigate({ name: "story", storyId: nextStory.id });
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

  const saveEditorAndClose = async () => {
    const pendingSave = latestStorySaveRef.current;

    if (pendingSave) {
      const didSave = await pendingSave;

      if (!didSave) {
        return;
      }
    }

    if (storyPersistenceError) {
      return;
    }

    setIsEditorOpen(false);
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
    navigate({ name: "home" });
    setIsStorybookOpen(false);
    setIsEditorOpen(false);
    setPendingDeleteStoryId(null);
    setIsAccountOpen(false);
  };

  const showActiveProfile = () => {
    beginStoryEntrance();
    const profileId = activeProfile?.id ?? selectedProfileId;

    if (profileId) {
      navigate({ name: "profile", profileId });
    } else {
      navigate({ name: "home" });
    }

    setIsStorybookOpen(false);
    setIsEditorOpen(false);
    setPendingDeleteStoryId(null);
  };

  useEffect(() => {
    if (route.name === "story" && route.storyId !== activeStoryId) {
      selectStory(route.storyId, { history: "none" });
    }
  }, [route, activeStoryId]);

  useEffect(() => {
    if (route.name === "profile" && hasHydratedPlatform && !selectedProfile) {
      replace({ name: "home" });
    }
  }, [hasHydratedPlatform, replace, route, selectedProfile]);

  const conversation = useScriptedConversation(config.messages, {
    autoPlay: isConversationIntroComplete,
    contactName: config.viewer.name,
    defaultSpeakerTypingSpeedLevel: config.defaultSpeakerTypingSpeedLevel,
    defaultPauseAfterMs: config.defaultPauseAfterMs,
    povTypingSpeedLevel: config.contact.typingSpeedLevel,
    typeAllSpeakers: story.presentationMode === "battle"
  });
  const visibleMessages = isConversationIntroComplete
    ? conversation.visibleMessages
    : [];
  const draftText = isConversationIntroComplete ? conversation.draftText : "";
  const isContactTyping =
    isConversationIntroComplete && conversation.isContactTyping;
  const isConversationComplete =
    isConversationIntroComplete && conversation.isComplete;
  const activeMessage = isConversationIntroComplete
    ? conversation.activeMessage
    : null;
  const activeMessageText = isConversationIntroComplete
    ? conversation.activeMessageText
    : "";
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

  const toggleAccountPanel = () => {
    setIsAccountOpen((isOpen) => !isOpen);
    setIsStorybookOpen(false);
  };

  const toolbarActions =
    canEditActiveStory && !isStoryListOpen ? (
      <>
        <StorybookMenu
          activeOwnerStories={activeOwnerStories}
          activeStoryId={activeStoryId}
          activeStoryRecord={activeStoryRecord}
          isOpen={isStorybookOpen}
          pendingDeleteStoryId={pendingDeleteStoryId}
          storybookError={storybookError}
          onCreateStory={() => void createStoryFromShell()}
          onDeleteStory={deleteStory}
          onEditStory={editStory}
          onPendingDeleteStoryChange={setPendingDeleteStoryId}
          onSelectStory={selectStory}
          onTitleChange={updateStoryTitle}
          onToggle={() => {
            setPendingDeleteStoryId(null);
            setIsStorybookOpen((isCurrentlyOpen) => !isCurrentlyOpen);
            setIsAccountOpen(false);
          }}
        />
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
    ) : null;

  const accountPanel = isAccountOpen ? (
    <AccountPanel
      accountError={accountError}
      authMode={authMode}
      displayName={displayName}
      isBusy={isBusy}
      password={password}
      session={session}
      username={username}
      onAuthModeChange={setAuthMode}
      onCreateStory={() => void createStoryFromShell()}
      onDisplayNameChange={setDisplayName}
      onLogout={() => void logoutFromShell()}
      onPasswordChange={setPassword}
      onSubmit={submitAuth}
      onUsernameChange={setUsername}
    />
  ) : null;

  const storyPlayer =
    story.presentationMode === "battle" ? (
      <BattleStoryPlayer
        activeMessage={activeMessage}
        config={config}
        currentDialogueText={activeMessageText}
        visibleMessages={visibleMessages}
      />
    ) : (
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
    );

  const mainContent = isStoryListOpen ? (
    <LandingPage
      onSelectProfile={(profileId) => {
        navigate({ name: "profile", profileId });
        setIsAccountOpen(false);
      }}
      onSelectStory={selectStory}
      profiles={profiles}
      searchQuery={searchQuery}
      selectedProfileId={selectedProfileId}
    />
  ) : (
    <div
      data-testid="story-stage"
      className={`mx-auto flex h-[calc(100dvh-176px)] min-h-[426px] w-full max-w-5xl flex-col items-center justify-center gap-4 transition-all duration-[1500ms] ease-out will-change-transform md:h-[calc(100dvh-104px)] ${
        isStoryEntranceVisible
          ? "translate-y-0 opacity-100"
          : "translate-y-3 opacity-0"
      } ${isConversationIntroComplete ? "" : "pointer-events-none"}`}
    >
      {storyPlayer}
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
  );

  return (
    <>
      <AppShell
        accountPanel={accountPanel}
        backgroundModeClass={backgroundModeClass}
        isStoryListOpen={isStoryListOpen}
        searchQuery={searchQuery}
        selectedProfile={selectedProfile}
        toolbarActions={toolbarActions}
        onAccountToggle={toggleAccountPanel}
        onActiveProfile={showActiveProfile}
        onCreateStory={() => void createStoryFromShell()}
        onHome={showHome}
        onSearchQueryChange={setSearchQuery}
      >
        {mainContent}
      </AppShell>
      {canEditActiveStory && isEditorOpen ? (
        story.presentationMode === "battle" ? (
          <BattleScriptEditor
            canUndo={undoStack.length > 0}
            config={config}
            isSaving={isStorySaving}
            onChange={updateConfig}
            onClose={() => setIsEditorOpen(false)}
            onSave={() => void saveEditorAndClose()}
            onStoryTitleChange={updateStoryTitle}
            onUndo={undoLastEdit}
            requiresPassword={EDITOR_REQUIRES_PASSWORD}
            saveError={storyPersistenceError}
            storyTitle={activeStoryRecord.title}
          />
        ) : (
          <ScriptEditor
            activeSceneId={story.activeSceneId}
            canUndo={undoStack.length > 0}
            config={config}
            isSaving={isStorySaving}
            onChange={updateConfig}
            onClose={() => setIsEditorOpen(false)}
            onSave={() => void saveEditorAndClose()}
            onSceneAdd={addScene}
            onSceneSelect={selectScene}
            onStoryTitleChange={updateStoryTitle}
            onUndo={undoLastEdit}
            requiresPassword={EDITOR_REQUIRES_PASSWORD}
            saveError={storyPersistenceError}
            scenes={story.scenes}
            storyTitle={activeStoryRecord.title}
          />
        )
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
    </>
  );
}
