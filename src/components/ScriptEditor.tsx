import type { ChangeEvent, FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Image as ImageIcon,
  Mic,
  Plus,
  Smile,
  Trash2,
  Undo2
} from "lucide-react";
import {
  addConversationMessage,
  EDITOR_PASSWORD,
  isEditorUnlockValid,
  MAX_STORY_SCENE_COUNT,
  normalizeConversationConfig,
  PROFILE_STATUS_OPTIONS,
  rememberEditorUnlock,
  removeConversationMessage,
  SCENE_MESSAGE_MAX_COUNT,
  SCENE_MESSAGE_WARNING_COUNT,
  type ConversationConfig,
  type ConversationMessage,
  type SpeakerId,
  type SpeedLevel,
  type StoryScene,
  updateConversationMessage
} from "../data/conversationConfig";
import {
  EMOJI_ENTRIES,
  getEmojiAutocomplete,
  insertTextAtSelection,
  searchEmojiEntries,
  type EmojiAutocomplete
} from "../utils/emojiTools";
import { AvatarCropper } from "./AvatarCropper";

type ScriptEditorProps = {
  activeSceneId: string;
  canUndo: boolean;
  config: ConversationConfig;
  isSaving?: boolean;
  onChange: (config: ConversationConfig) => void;
  onClose: () => void;
  onSave?: () => void | Promise<void>;
  onSceneAdd: () => void;
  onSceneSelect: (sceneId: string) => void;
  onStoryTitleChange: (title: string) => void;
  onUndo: () => void;
  requiresPassword?: boolean;
  saveError?: string;
  scenes: StoryScene[];
  storyTitle: string;
};

const fieldClass =
  "mt-1 w-full min-w-0 rounded-xl border border-indigo-100/80 bg-white/90 px-3 py-2 text-sm text-slate-950 shadow-inner outline-none transition placeholder:text-slate-500 focus:border-indigo-200 focus:ring-2 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:bg-slate-100/70 disabled:text-slate-500";

const labelClass = "text-xs font-semibold uppercase tracking-[0.08em] text-indigo-900";

function toNumber(value: string) {
  return Number.parseInt(value, 10);
}

function toSpeedLevel(value: string): SpeedLevel {
  return Math.min(5, Math.max(1, toNumber(value) || 3)) as SpeedLevel;
}

const povSpeedOptions = [
  { value: 1, label: "1 - relaxed" },
  { value: 2, label: "2 - casual" },
  { value: 3, label: "3 - natural" },
  { value: 4, label: "4 - quick" },
  { value: 5, label: "5 - rapid" }
] as const;

const speakerTypingOptions = [
  { value: 1, label: "1 - longest" },
  { value: 2, label: "2 - long" },
  { value: 3, label: "3 - normal" },
  { value: 4, label: "4 - quick" },
  { value: 5, label: "5 - shortest" }
] as const;

type ActiveEmojiAutocomplete = EmojiAutocomplete & {
  messageId: string;
};

function getProfileInitials(name: string): string {
  return name.trim().charAt(0).toUpperCase();
}

function getRequiredFieldClass(value: string): string {
  return `${fieldClass} ${
    value.trim().length === 0
      ? "bg-rose-50/70 placeholder:text-rose-400/80"
      : ""
  }`;
}

function formatRequiredSettingsWarning(fields: string[]): string {
  if (fields.length === 1) {
    return `Fill ${fields[0]} before saving.`;
  }

  return `Fill ${fields.slice(0, -1).join(", ")} and ${
    fields[fields.length - 1]
  } before saving.`;
}

function getDefaultMessageTypingSpeedLevel(
  message: ConversationMessage,
  config: ConversationConfig
): SpeedLevel {
  return message.speaker === "viewer"
    ? config.defaultSpeakerTypingSpeedLevel
    : config.contact.typingSpeedLevel;
}

function getDisplayedMessageTypingSpeedLevel(
  message: ConversationMessage,
  config: ConversationConfig
): SpeedLevel {
  const defaultSpeedLevel = getDefaultMessageTypingSpeedLevel(message, config);

  return message.useDefaultTypingMs !== false
    ? defaultSpeedLevel
    : message.typingSpeedLevel ?? defaultSpeedLevel;
}

function getMessageSpeakerInitial(
  message: ConversationMessage,
  config: ConversationConfig
): string {
  const speakerName =
    message.speaker === "viewer" ? config.viewer.name : config.contact.name;

  return speakerName.trim().charAt(0).toUpperCase() || "?";
}

export function ScriptEditor({
  activeSceneId,
  canUndo,
  config,
  isSaving = false,
  onChange,
  onClose,
  onSave = onClose,
  onSceneAdd,
  onSceneSelect,
  onStoryTitleChange,
  onUndo,
  requiresPassword = true,
  saveError = "",
  scenes,
  storyTitle
}: ScriptEditorProps) {
  const [password, setPassword] = useState("");
  const [isUnlocked, setIsUnlocked] = useState(
    () => !requiresPassword || isEditorUnlockValid()
  );
  const [passwordError, setPasswordError] = useState("");
  const [settingsWarning, setSettingsWarning] = useState("");
  const [collapsedMessageIds, setCollapsedMessageIds] = useState<Set<string>>(
    () => new Set()
  );
  const [isGeneralSettingsCollapsed, setIsGeneralSettingsCollapsed] =
    useState(false);
  const [isSettingsCollapsed, setIsSettingsCollapsed] = useState(false);
  const [activeEmojiPickerMessageId, setActiveEmojiPickerMessageId] =
    useState<string | null>(null);
  const [emojiSearch, setEmojiSearch] = useState("");
  const [activeEmojiAutocomplete, setActiveEmojiAutocomplete] =
    useState<ActiveEmojiAutocomplete | null>(null);
  const [cropTarget, setCropTarget] = useState<{
    imageUrl: string;
    label: string;
    profile: "contact" | "viewer";
  } | null>(null);
  const textareaRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const activeSceneIndex = Math.max(
    0,
    scenes.findIndex((scene) => scene.id === activeSceneId)
  );
  const messageCount = config.messages.length;
  const remainingMessageCount = Math.max(
    0,
    SCENE_MESSAGE_MAX_COUNT - messageCount
  );
  const isNearSceneLimit = messageCount >= SCENE_MESSAGE_WARNING_COUNT;
  const isAtSceneLimit = messageCount >= SCENE_MESSAGE_MAX_COUNT;
  const nextSceneLabel = `Scene ${activeSceneIndex + 2}`;
  const sceneLinePercent = Math.min(
    100,
    Math.round((messageCount / SCENE_MESSAGE_MAX_COUNT) * 100)
  );
  const isStoryTitleMissing = storyTitle.trim().length === 0;
  const isSceneTitleMissing = config.sceneTitle.trim().length === 0;
  const isContactNameMissing = config.contact.name.trim().length === 0;
  const isViewerNameMissing = config.viewer.name.trim().length === 0;
  const missingRequiredSettings = [
    isStoryTitleMissing ? "Story name" : "",
    isSceneTitleMissing ? "Scene title" : "",
    isContactNameMissing ? "POV name" : "",
    isViewerNameMissing ? "Speaker name" : ""
  ].filter(Boolean);

  useEffect(() => {
    setCollapsedMessageIds(new Set());
    setActiveEmojiPickerMessageId(null);
    setActiveEmojiAutocomplete(null);
    setEmojiSearch("");
  }, [activeSceneId]);

  const unlock = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (password === EDITOR_PASSWORD) {
      setIsUnlocked(true);
      rememberEditorUnlock();
      setPasswordError("");
      return;
    }

    setPasswordError("Wrong password");
  };

  const updateConfig = (nextConfig: ConversationConfig) => {
    setSettingsWarning("");
    onChange(normalizeConversationConfig(nextConfig));
  };

  const updateContact = (
    field: keyof ConversationConfig["contact"],
    value: string | number
  ) => {
    updateConfig({
      ...config,
      contact: {
        ...config.contact,
        [field]: value
      }
    });
  };

  const updateContactName = (name: string) => {
    const currentInitials = config.contact.initials.trim();
    const currentNameInitials = getProfileInitials(config.contact.name);
    const shouldSyncInitials =
      currentInitials.length === 0 || currentInitials === currentNameInitials;

    updateConfig({
      ...config,
      contact: {
        ...config.contact,
        initials: shouldSyncInitials
          ? getProfileInitials(name)
          : config.contact.initials,
        name
      }
    });
  };

  const openAvatarCropper = (
    event: ChangeEvent<HTMLInputElement>,
    profile: "contact" | "viewer",
    label: string
  ) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setCropTarget({
          imageUrl: reader.result,
          label,
          profile
        });
      }
    };
    reader.readAsDataURL(file);
    event.target.value = "";
  };

  const updateViewer = (
    field: keyof ConversationConfig["viewer"],
    value: string | number
  ) => {
    updateConfig({
      ...config,
      viewer: {
        ...config.viewer,
        [field]: value
      }
    });
  };

  const updateViewerName = (name: string) => {
    const currentInitials = config.viewer.initials.trim();
    const currentNameInitials = getProfileInitials(config.viewer.name);
    const shouldSyncInitials =
      currentInitials.length === 0 || currentInitials === currentNameInitials;

    updateConfig({
      ...config,
      viewer: {
        ...config.viewer,
        initials: shouldSyncInitials
          ? getProfileInitials(name)
          : config.viewer.initials,
        name
      }
    });
  };

  const toggleMessageCollapsed = (messageId: string) => {
    setCollapsedMessageIds((currentIds) => {
      const nextIds = new Set(currentIds);

      if (nextIds.has(messageId)) {
        nextIds.delete(messageId);
      } else {
        nextIds.add(messageId);
      }

      return nextIds;
    });
  };

  const updateMessage = (
    message: ConversationMessage,
    patch: Partial<ConversationMessage>
  ) => {
    onChange(updateConversationMessage(config, message.id, patch));
  };

  const updateMessageText = (
    message: ConversationMessage,
    text: string,
    cursorPosition: number
  ) => {
    updateMessage(message, { text });

    const autocomplete = getEmojiAutocomplete(text, cursorPosition);
    setActiveEmojiAutocomplete(
      autocomplete ? { ...autocomplete, messageId: message.id } : null
    );
  };

  const insertEmojiIntoMessage = (
    message: ConversationMessage,
    emoji: string,
    selection?: { end: number; start: number }
  ) => {
    const textarea = textareaRefs.current[message.id];
    const shouldUseTextareaSelection =
      textarea !== null && document.activeElement === textarea;
    const selectionStart =
      selection?.start ??
      (shouldUseTextareaSelection ? textarea.selectionStart : message.text.length);
    const selectionEnd =
      selection?.end ??
      (shouldUseTextareaSelection ? textarea.selectionEnd : selectionStart);
    const result = insertTextAtSelection(
      message.text,
      emoji,
      selectionStart,
      selectionEnd
    );

    updateMessage(message, { text: result.text });
    setActiveEmojiAutocomplete(null);
    setActiveEmojiPickerMessageId(null);
    setEmojiSearch("");

    window.requestAnimationFrame(() => {
      const nextTextarea = textareaRefs.current[message.id];

      nextTextarea?.focus();
      nextTextarea?.setSelectionRange(result.nextCursor, result.nextCursor);
    });
  };

  const handleSpeakerChange = (
    event: ChangeEvent<HTMLSelectElement>,
    message: ConversationMessage
  ) => {
    updateMessage(message, {
      speaker: event.target.value as SpeakerId,
      useDefaultPauseAfterMs: true,
      useDefaultTypingMs: true
    });
  };

  const saveChanges = () => {
    if (missingRequiredSettings.length > 0) {
      setSettingsWarning(formatRequiredSettingsWarning(missingRequiredSettings));
      setIsGeneralSettingsCollapsed(false);
      if (isSceneTitleMissing || isContactNameMissing || isViewerNameMissing) {
        setIsSettingsCollapsed(false);
      }
      return;
    }

    setSettingsWarning("");
    void onSave();
  };

  return (
    <aside
      role="dialog"
      aria-label="Script editor"
      className="fixed inset-0 z-50 flex flex-col overflow-x-hidden overflow-y-hidden bg-gradient-to-br from-slate-100 via-indigo-50 to-teal-50 text-slate-950 shadow-[0_24px_80px_rgba(15,23,42,0.35)]"
    >
      <div className="relative flex flex-wrap items-start justify-between gap-3 border-b border-indigo-100/80 bg-gradient-to-r from-white/90 via-indigo-50/90 to-cyan-50/85 px-4 py-4 backdrop-blur-md sm:px-6 lg:px-8">
        <div className="min-w-0">
          <h2 className="truncate text-3xl font-bold tracking-normal text-slate-950">
            Script editor
          </h2>
          <p className="mt-1 text-sm font-semibold text-slate-600">
            edit your story here
          </p>
        </div>
        <div className="flex w-full min-w-0 flex-wrap items-center justify-start gap-2 sm:w-auto sm:justify-end">
          {isUnlocked ? (
            <>
              <button
                type="button"
                aria-label="Undo last edit"
                title="Undo last edit"
                disabled={!canUndo}
                onClick={onUndo}
                className="flex h-10 min-w-0 items-center justify-center gap-2 rounded-full bg-white/80 px-3 text-sm font-semibold text-slate-950 ring-1 ring-slate-200 transition hover:bg-white disabled:cursor-not-allowed disabled:bg-slate-100/80 disabled:text-slate-400 sm:px-4"
              >
                <Undo2 className="h-4 w-4" aria-hidden="true" />
                Undo
              </button>
            </>
          ) : null}
          <button
            type="button"
            aria-label="Save changes"
            aria-busy={isSaving}
            title="Save changes"
            onClick={saveChanges}
            className="flex h-10 min-w-0 items-center justify-center gap-2 rounded-full bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 sm:px-5"
          >
            <Check className="h-4 w-4" aria-hidden="true" />
            Save changes
          </button>
        </div>
      </div>

      {requiresPassword && !isUnlocked ? (
        <form
          onSubmit={unlock}
          className="mx-auto mt-16 w-[min(440px,calc(100vw-32px))] rounded-2xl border border-slate-200/70 bg-white/80 p-5 shadow-xl backdrop-blur-md"
        >
          <label className={labelClass} htmlFor="editor-password">
            Editor password
          </label>
          <input
            id="editor-password"
            aria-label="Editor password"
            className={fieldClass}
            value={password}
            inputMode="numeric"
            type="password"
            onChange={(event) => setPassword(event.target.value)}
          />
          {passwordError ? (
            <p className="mt-2 text-sm font-medium text-rose-700">{passwordError}</p>
          ) : null}
          <button
            type="submit"
            className="mt-4 h-11 w-full rounded-full bg-slate-950 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            Unlock editor
          </button>
        </form>
      ) : (
        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-3 py-5 sm:px-6 lg:px-8">
          <div className="mx-auto grid w-full max-w-7xl min-w-0 gap-4 lg:gap-5">
          {settingsWarning ? (
            <p className="rounded-xl border border-rose-200 bg-rose-50/80 px-3 py-2 text-sm font-semibold text-rose-800">
              {settingsWarning}
            </p>
          ) : null}
          {saveError ? (
            <p className="rounded-xl border border-rose-200 bg-rose-50/80 px-3 py-2 text-sm font-semibold text-rose-800">
              {saveError}
            </p>
          ) : null}
          <section className="grid min-w-0 rounded-2xl border border-indigo-100/80 bg-white/60 p-4 shadow-[0_18px_50px_rgba(79,70,229,0.1)] backdrop-blur-md">
            <button
              type="button"
              aria-controls="general-settings-content"
              aria-expanded={!isGeneralSettingsCollapsed}
              aria-label={`${
                isGeneralSettingsCollapsed ? "Expand" : "Collapse"
              } general settings`}
              onClick={() =>
                setIsGeneralSettingsCollapsed(
                  (isCurrentlyCollapsed) => !isCurrentlyCollapsed
                )
              }
              className="mb-3 flex min-w-0 items-center gap-2 rounded-xl px-1 py-1 text-left text-xs font-bold uppercase tracking-[0.14em] text-indigo-900 transition hover:bg-indigo-50/70"
            >
              {isGeneralSettingsCollapsed ? (
                <ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" />
              ) : (
                <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />
              )}
              General Settings
              <span className="truncate normal-case tracking-normal text-slate-500">
                {storyTitle.trim() || "add a name please"}
              </span>
            </button>
            {!isGeneralSettingsCollapsed ? (
              <div
                id="general-settings-content"
                className="grid min-w-0 gap-4"
              >
                <label className={labelClass} htmlFor="story-title">
                  Story name
                  <input
                    id="story-title"
                    aria-label="Story name"
                    aria-invalid={isStoryTitleMissing}
                    className={getRequiredFieldClass(storyTitle)}
                    placeholder="add a name please"
                    value={storyTitle}
                    onChange={(event) => onStoryTitleChange(event.target.value)}
                  />
                </label>
                <div className="min-w-0">
                  <p className={labelClass}>Choose scene</p>
                  <nav
                    aria-label="Choose scene"
                    className="mt-2 flex min-w-0 flex-wrap gap-2"
                  >
                    {scenes.map((scene, index) => {
                      const isActive = scene.id === activeSceneId;

                      return (
                        <button
                          key={scene.id}
                          type="button"
                          aria-label={`Choose scene ${index + 1}: ${
                            scene.sceneTitle
                          }`}
                          title={scene.sceneTitle}
                          onClick={() => onSceneSelect(scene.id)}
                          className={`grid h-11 w-11 shrink-0 place-items-center rounded-full text-sm font-bold ring-1 transition ${
                            isActive
                              ? "bg-slate-950 text-white ring-slate-950"
                              : "bg-white/85 text-slate-800 ring-slate-200 hover:bg-white"
                          }`}
                        >
                          {index + 1}
                        </button>
                      );
                    })}
                    {scenes.length < MAX_STORY_SCENE_COUNT ? (
                      <button
                        type="button"
                        aria-label="Add scene"
                        title="Add scene"
                        onClick={onSceneAdd}
                        className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-dashed border-slate-300 bg-white/85 text-slate-800 transition hover:bg-white"
                      >
                        <Plus className="h-4 w-4" aria-hidden="true" />
                      </button>
                    ) : null}
                  </nav>
                </div>
              </div>
            ) : null}
          </section>
          <div className="grid w-full min-w-0 gap-4 lg:gap-5 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
          <section className="grid min-w-0 self-start rounded-2xl border border-indigo-100/80 bg-indigo-50/55 p-4 shadow-[0_18px_50px_rgba(79,70,229,0.12)] backdrop-blur-md">
            <button
              type="button"
              aria-expanded={!isSettingsCollapsed}
              aria-label={`${
                isSettingsCollapsed ? "Expand" : "Collapse"
              } scene settings`}
              onClick={() =>
                setIsSettingsCollapsed((isCurrentlyCollapsed) => !isCurrentlyCollapsed)
              }
              className="mb-3 flex min-w-0 items-center gap-2 rounded-xl px-1 py-1 text-left text-xs font-bold uppercase tracking-[0.14em] text-indigo-900 transition hover:bg-white/55"
            >
              {isSettingsCollapsed ? (
                <ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" />
              ) : (
                <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />
              )}
              Scene settings
              <span className="truncate normal-case tracking-normal text-slate-500">
                {config.sceneTitle}
              </span>
            </button>
            {!isSettingsCollapsed ? (
            <div className="grid gap-3">
              <label className={labelClass} htmlFor="scene-title">
                Scene title
              </label>
              <input
                id="scene-title"
                aria-label="Scene title"
                aria-invalid={config.sceneTitle.trim().length === 0}
                className={getRequiredFieldClass(config.sceneTitle)}
                placeholder="write scene title"
                value={config.sceneTitle}
                onChange={(event) =>
                  updateConfig({ ...config, sceneTitle: event.target.value })
                }
              />

              <div className="grid gap-3 sm:grid-cols-2">
                <label className={labelClass}>
                  POV name
                  <input
                    aria-label="POV name"
                    aria-invalid={config.contact.name.trim().length === 0}
                    className={getRequiredFieldClass(config.contact.name)}
                    placeholder="write POV name"
                    value={config.contact.name}
                    onChange={(event) => updateContactName(event.target.value)}
                  />
                </label>
                <label className={labelClass}>
                  POV initials
                  <input
                    aria-label="POV initials"
                    className={fieldClass}
                    value={config.contact.initials}
                    onChange={(event) =>
                      updateContact("initials", event.target.value)
                    }
                  />
                </label>
              </div>

              <label className={labelClass}>
                POV status
                <select
                  aria-label="POV status"
                  className={fieldClass}
                  value={config.contact.status}
                  onChange={(event) => updateContact("status", event.target.value)}
                >
                  {PROFILE_STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className={labelClass}>
                  Speaker name
                  <input
                    aria-label="Speaker name"
                    aria-invalid={config.viewer.name.trim().length === 0}
                    className={getRequiredFieldClass(config.viewer.name)}
                    placeholder="write speaker name"
                    value={config.viewer.name}
                    onChange={(event) => updateViewerName(event.target.value)}
                  />
                </label>
                <label className={labelClass}>
                  Speaker initials
                  <input
                    aria-label="Speaker initials"
                    className={fieldClass}
                    value={config.viewer.initials}
                    onChange={(event) =>
                      updateViewer("initials", event.target.value)
                    }
                  />
                </label>
              </div>

              <label className={labelClass}>
                Speaker status
                <select
                  aria-label="Speaker status"
                  className={fieldClass}
                  value={config.viewer.status}
                  onChange={(event) => updateViewer("status", event.target.value)}
                >
                  {PROFILE_STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid gap-3 rounded-2xl border border-indigo-100/70 bg-white/55 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]">
                <div className="flex items-center gap-3">
                  <img
                    alt=""
                    className="h-16 w-16 rounded-full object-cover ring-2 ring-white"
                    src={config.contact.avatarUrl}
                  />
                  <div className="min-w-0 flex-1">
                    <label className={labelClass}>
                      POV avatar image
                      <input
                        aria-label="POV avatar image"
                        className={fieldClass}
                        value={config.contact.avatarUrl}
                        onChange={(event) =>
                          updateContact("avatarUrl", event.target.value)
                        }
                      />
                    </label>
                  </div>
                </div>
                <label className={labelClass}>
                  Upload avatar
                  <input
                    aria-label="Upload POV avatar"
                    accept="image/*"
                    className={`${fieldClass} file:mr-3 file:rounded-full file:border-0 file:bg-slate-950 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white`}
                    type="file"
                    onChange={(event) =>
                      openAvatarCropper(event, "contact", "Crop POV avatar")
                    }
                  />
                </label>
              </div>

              <div className="grid gap-3 rounded-2xl border border-indigo-100/70 bg-white/55 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]">
                <div className="flex items-center gap-3">
                  <img
                    alt=""
                    className="h-16 w-16 rounded-full object-cover ring-2 ring-white"
                    src={config.viewer.avatarUrl}
                  />
                  <div className="min-w-0 flex-1">
                    <label className={labelClass}>
                      Speaker avatar image
                      <input
                        aria-label="Speaker avatar image"
                        className={fieldClass}
                        value={config.viewer.avatarUrl}
                        onChange={(event) =>
                          updateViewer("avatarUrl", event.target.value)
                        }
                      />
                    </label>
                  </div>
                </div>
                <label className={labelClass}>
                  Upload speaker avatar
                  <input
                    aria-label="Upload speaker avatar"
                    accept="image/*"
                    className={`${fieldClass} file:mr-3 file:rounded-full file:border-0 file:bg-slate-950 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white`}
                    type="file"
                    onChange={(event) =>
                      openAvatarCropper(event, "viewer", "Crop speaker avatar")
                    }
                  />
                </label>
              </div>

              <div className="border-t border-indigo-100/80 pt-3">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-indigo-900">
                  Timing defaults
                </p>
              </div>

              <label className={labelClass}>
                POV typing speed
                <select
                  aria-label="POV typing speed"
                  className={fieldClass}
                  value={config.contact.typingSpeedLevel}
                  onChange={(event) =>
                    updateContact(
                      "typingSpeedLevel",
                      toSpeedLevel(event.target.value)
                    )
                  }
                >
                  {povSpeedOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-xs normal-case tracking-normal text-slate-500">
                  Higher means {config.contact.name} types faster into the composer.
                </span>
              </label>
              <label className={labelClass}>
                Speaker is typing speed
                <select
                  aria-label="Speaker is typing speed"
                  className={fieldClass}
                  value={config.defaultSpeakerTypingSpeedLevel}
                  onChange={(event) =>
                    updateConfig({
                      ...config,
                      defaultSpeakerTypingSpeedLevel: toSpeedLevel(
                        event.target.value
                      )
                    })
                  }
                >
                  {speakerTypingOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-xs normal-case tracking-normal text-slate-500">
                  Higher means {config.viewer.name}'s typing indicator resolves sooner.
                </span>
              </label>
              <label className={labelClass}>
                Default pause after ms
                <input
                  aria-label="Default pause after ms"
                  className={fieldClass}
                  min={0}
                  max={5000}
                  type="number"
                  value={config.defaultPauseAfterMs}
                  onChange={(event) =>
                    updateConfig({
                      ...config,
                      defaultPauseAfterMs: toNumber(event.target.value)
                    })
                  }
                />
              </label>
            </div>
            ) : null}
          </section>

          <section className="grid min-w-0 content-start gap-3">
            <div
              className={`rounded-2xl border p-4 shadow-lg backdrop-blur-md ${
                isNearSceneLimit
                  ? "border-amber-200 bg-amber-50/80 text-amber-950"
                  : "border-indigo-100/70 bg-indigo-50/50 text-indigo-950"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/70 ring-1 ring-white/80">
                  <div
                    className={`h-full rounded-full ${
                      isNearSceneLimit
                        ? "bg-gradient-to-r from-amber-300 to-orange-400"
                        : "bg-gradient-to-r from-indigo-400 to-teal-300"
                    }`}
                    style={{ width: `${sceneLinePercent}%` }}
                  />
                </div>
                <p className="shrink-0 text-sm font-bold">
                  {messageCount} / {SCENE_MESSAGE_MAX_COUNT} lines
                </p>
              </div>
              {isNearSceneLimit ? (
                <p className="mt-2 text-sm font-semibold">
                  {isAtSceneLimit
                    ? `Scene limit reached. Start ${nextSceneLabel} to continue.`
                    : `${remainingMessageCount} lines left before ${nextSceneLabel}.`}
                </p>
              ) : null}
            </div>
            {config.messages.map((message, index) => {
              const isCollapsed = collapsedMessageIds.has(message.id);
              const isEmojiPickerOpen =
                activeEmojiPickerMessageId === message.id;
              const emojiPickerMatches = isEmojiPickerOpen
                ? searchEmojiEntries(emojiSearch)
                : EMOJI_ENTRIES.slice(0, 8);
              const emojiAutocomplete =
                activeEmojiAutocomplete?.messageId === message.id
                  ? activeEmojiAutocomplete
                  : null;

              return (
              <article
                key={message.id}
                className="min-w-0 rounded-2xl border border-indigo-100/70 bg-white/60 p-4 shadow-[0_16px_42px_rgba(79,70,229,0.1)] backdrop-blur-md"
              >
                <div className="mb-3 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    aria-expanded={!isCollapsed}
                    aria-label={`${isCollapsed ? "Expand" : "Collapse"} line ${
                      index + 1
                    }`}
                    onClick={() => toggleMessageCollapsed(message.id)}
                    className="flex min-w-0 flex-1 items-center gap-2 rounded-xl px-1 py-1 text-left text-xs font-bold uppercase tracking-[0.14em] text-indigo-900 transition hover:bg-indigo-50/70"
                  >
                    {isCollapsed ? (
                      <ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" />
                    ) : (
                      <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />
                    )}
                    <span className="shrink-0">Line {index + 1}</span>
                    <span className="truncate normal-case tracking-normal text-slate-500">
                      {getMessageSpeakerInitial(message, config)}:{" "}
                      {message.text.trim() || "write something"}
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete line ${index + 1}`}
                    title={`Delete line ${index + 1}`}
                    onClick={() => onChange(removeConversationMessage(config, message.id))}
                    className="grid h-8 w-8 place-items-center rounded-full bg-white/70 text-slate-600 ring-1 ring-slate-200 transition hover:bg-white"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>

                {!isCollapsed ? (
                  <>
                    <div className="grid gap-3">
                      <label
                        data-testid={`line-${index + 1}-speaker-row`}
                        className={`${labelClass} inline-flex w-fit max-w-full items-center gap-3`}
                      >
                        <span>Speaker</span>
                        <select
                          aria-label={`Message ${index + 1} speaker`}
                          className={`${fieldClass} !mt-0 !w-40`}
                          value={message.speaker}
                          onChange={(event) => handleSpeakerChange(event, message)}
                        >
                          <option value="viewer">{config.viewer.name}</option>
                          <option value="contact">{config.contact.name}</option>
                        </select>
                      </label>
                      <div
                        data-testid={`line-${index + 1}-text-row`}
                        className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2"
                      >
                        <div className="relative grid min-w-0 gap-2">
                          <label className={labelClass}>
                            Text
                            <textarea
                              ref={(element) => {
                                textareaRefs.current[message.id] = element;
                              }}
                              aria-label={`Message ${index + 1} text`}
                              className={`${fieldClass} min-h-24 resize-y ${
                                message.text.trim().length === 0
                                  ? "bg-rose-50/70 placeholder:text-rose-400/80"
                                  : ""
                              }`}
                              placeholder="write something"
                              value={message.text}
                              onBlur={() => {
                                window.setTimeout(() => {
                                  setActiveEmojiAutocomplete(
                                    (currentAutocomplete) =>
                                      currentAutocomplete?.messageId === message.id
                                        ? null
                                        : currentAutocomplete
                                  );
                                }, 120);
                              }}
                              onChange={(event) =>
                                updateMessageText(
                                  message,
                                  event.target.value,
                                  event.currentTarget.selectionStart ??
                                    event.target.value.length
                                )
                              }
                              onKeyUp={(event) => {
                                const autocomplete = getEmojiAutocomplete(
                                  event.currentTarget.value,
                                  event.currentTarget.selectionStart ??
                                    event.currentTarget.value.length
                                );

                                setActiveEmojiAutocomplete(
                                  autocomplete
                                    ? { ...autocomplete, messageId: message.id }
                                    : null
                                );
                              }}
                            />
                          </label>

                      {isEmojiPickerOpen ? (
                        <div
                          role="dialog"
                          aria-label={`Emoji picker for line ${index + 1}`}
                          className="absolute left-0 top-20 z-20 grid w-[min(280px,calc(100vw-84px))] gap-2 rounded-2xl border border-indigo-100 bg-white/95 p-3 shadow-2xl backdrop-blur-xl"
                        >
                          <input
                            aria-label={`Search emoji for line ${index + 1}`}
                            className={fieldClass}
                            placeholder="search emoji"
                            value={emojiSearch}
                            onChange={(event) =>
                              setEmojiSearch(event.target.value)
                            }
                          />
                          <div className="grid grid-cols-4 gap-1">
                            {emojiPickerMatches.map((entry) => (
                              <button
                                key={entry.shortcode}
                                type="button"
                                aria-label={`Insert ${entry.emoji} ${entry.shortcode} emoji`}
                                title={`:${entry.shortcode}:`}
                                onMouseDown={(event) =>
                                  event.preventDefault()
                                }
                                onClick={() =>
                                  insertEmojiIntoMessage(message, entry.emoji)
                                }
                                className="grid h-10 place-items-center rounded-xl text-xl transition hover:bg-indigo-50"
                              >
                                {entry.emoji}
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : null}

                          {emojiAutocomplete ? (
                            <div>
                              <div className="grid w-[min(320px,100%)] gap-1 rounded-2xl border border-indigo-100 bg-white/95 p-2 shadow-xl">
                                {emojiAutocomplete.matches.map((entry) => (
                                  <button
                                    key={entry.shortcode}
                                    type="button"
                                    aria-label={`Use ${entry.emoji} ${entry.shortcode} emoji autocomplete`}
                                    onMouseDown={(event) => event.preventDefault()}
                                    onClick={() =>
                                      insertEmojiIntoMessage(message, entry.emoji, {
                                        end: emojiAutocomplete.tokenEnd,
                                        start: emojiAutocomplete.tokenStart
                                      })
                                    }
                                    className="flex items-center gap-2 rounded-xl px-2 py-1.5 text-left text-sm font-semibold text-slate-800 transition hover:bg-indigo-50"
                                  >
                                    <span className="text-lg">{entry.emoji}</span>
                                    <span>:{entry.shortcode}:</span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          ) : null}
                        </div>
                        <div
                          data-testid={`line-${index + 1}-text-tools`}
                          className="mt-6 flex shrink-0 flex-col items-center gap-1 self-start"
                        >
                          <button
                            type="button"
                            aria-label={`Open emoji picker for line ${index + 1}`}
                            title="Emoji"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => {
                              setEmojiSearch("");
                              setActiveEmojiAutocomplete(null);
                              setActiveEmojiPickerMessageId((currentMessageId) =>
                                currentMessageId === message.id
                                  ? null
                                  : message.id
                              );
                            }}
                            className="grid h-7 w-7 place-items-center rounded-full text-indigo-700 transition hover:bg-indigo-50"
                          >
                            <Smile className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            aria-label={`Attach image to line ${
                              index + 1
                            } (coming soon)`}
                            title="Image attachments coming soon"
                            disabled
                            className="grid h-7 w-7 place-items-center rounded-full text-slate-400 disabled:cursor-not-allowed"
                          >
                            <ImageIcon
                              className="h-3.5 w-3.5"
                              aria-hidden="true"
                            />
                          </button>
                          <button
                            type="button"
                            aria-label={`Add voice clip to line ${
                              index + 1
                            } (coming soon)`}
                            title="Voice clips coming soon"
                            disabled
                            className="grid h-7 w-7 place-items-center rounded-full text-slate-400 disabled:cursor-not-allowed"
                          >
                            <Mic className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                    </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <label className={labelClass}>
                      Typing speed
                      <select
                        aria-label={`Message ${index + 1} typing speed`}
                        className={fieldClass}
                        disabled={message.useDefaultTypingMs !== false}
                        value={getDisplayedMessageTypingSpeedLevel(message, config)}
                        onChange={(event) =>
                          updateMessage(message, {
                            typingSpeedLevel: toSpeedLevel(event.target.value)
                          })
                        }
                      >
                        {(message.speaker === "viewer"
                          ? speakerTypingOptions
                          : povSpeedOptions
                        ).map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                      <input
                        aria-label={`Line ${index + 1} use default typing time`}
                        checked={message.useDefaultTypingMs !== false}
                        className="h-4 w-4 rounded border-slate-300 text-slate-950 focus:ring-slate-300"
                        type="checkbox"
                        onChange={(event) =>
                          updateMessage(message, {
                            useDefaultTypingMs: event.target.checked
                          })
                        }
                      />
                      Use default
                    </label>
                  </div>
                  <div className="grid gap-2">
                    <label className={labelClass}>
                      Pause after ms
                      <input
                        aria-label={`Message ${index + 1} pause milliseconds`}
                        className={fieldClass}
                        disabled={message.useDefaultPauseAfterMs !== false}
                        min={0}
                        type="number"
                        value={message.pauseAfterMs ?? config.defaultPauseAfterMs}
                        onChange={(event) =>
                          updateMessage(message, {
                            pauseAfterMs: toNumber(event.target.value)
                          })
                        }
                      />
                    </label>
                    <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                      <input
                        aria-label={`Line ${index + 1} use default pause time`}
                        checked={message.useDefaultPauseAfterMs !== false}
                        className="h-4 w-4 rounded border-slate-300 text-slate-950 focus:ring-slate-300"
                        type="checkbox"
                        onChange={(event) =>
                          updateMessage(message, {
                            useDefaultPauseAfterMs: event.target.checked
                          })
                        }
                      />
                      Use default
                    </label>
                  </div>
                </div>
                  </>
                ) : null}
              </article>
              );
            })}

            <div className="rounded-2xl border border-indigo-100/70 bg-white/55 p-4 shadow-[0_16px_42px_rgba(79,70,229,0.1)] backdrop-blur-md">
            <button
              type="button"
              aria-label="Add line"
              disabled={isAtSceneLimit}
              onClick={() => onChange(addConversationMessage(config))}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-full bg-white/80 px-4 text-sm font-semibold text-slate-950 ring-1 ring-slate-200 transition hover:bg-white disabled:cursor-not-allowed disabled:bg-slate-100/80 disabled:text-slate-400"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add line
            </button>
          </div>
          </section>
          </div>
          </div>
        </div>
      )}
      {cropTarget ? (
        <AvatarCropper
          imageUrl={cropTarget.imageUrl}
          label={cropTarget.label}
          onCancel={() => setCropTarget(null)}
          onConfirm={(avatarUrl) => {
            if (cropTarget.profile === "contact") {
              updateContact("avatarUrl", avatarUrl);
            } else {
              updateViewer("avatarUrl", avatarUrl);
            }

            setCropTarget(null);
          }}
        />
      ) : null}
    </aside>
  );
}
