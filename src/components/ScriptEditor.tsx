import type { ChangeEvent, FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardPaste,
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
import { parseScriptText } from "../utils/scriptImport";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { AvatarCropper } from "./AvatarCropper";
import { ConversationPreview } from "./ConversationPreview";

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

type EditorPanel = "settings" | "script" | "preview";

const fieldClass =
  "mt-1 w-full min-w-0 rounded-xl border border-[var(--editor-field-border)] bg-[var(--editor-field)] px-3 py-2 text-sm text-[var(--editor-ink)] shadow-inner outline-none transition placeholder:text-[var(--editor-placeholder)] focus:border-[var(--editor-accent)] focus:ring-2 focus:ring-[var(--editor-focus-ring)] disabled:cursor-not-allowed disabled:bg-[var(--editor-disabled-bg)] disabled:text-[var(--editor-disabled-ink)]";

const labelClass =
  "text-xs font-semibold uppercase tracking-[0.08em] text-[var(--editor-label)]";

const panelClass =
  "rounded-2xl border border-[var(--editor-border)] bg-[var(--editor-panel)] p-4 shadow-[0_16px_40px_rgba(120,80,40,0.12)]";

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

const PANEL_TABS: { id: EditorPanel; label: string }[] = [
  { id: "settings", label: "Settings" },
  { id: "script", label: "Script" },
  { id: "preview", label: "Preview" }
];

type ActiveEmojiAutocomplete = EmojiAutocomplete & {
  messageId: string;
};

function getProfileInitials(name: string): string {
  return name.trim().charAt(0).toUpperCase();
}

function getRequiredFieldClass(value: string): string {
  return `${fieldClass} ${
    value.trim().length === 0
      ? "bg-[var(--editor-field-missing)] placeholder:text-[var(--editor-placeholder-missing)]"
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
  const [activePanel, setActivePanel] = useState<EditorPanel>("script");
  const [isPasteOpen, setIsPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pasteReplace, setPasteReplace] = useState(false);
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
  const isWide = useMediaQuery("(min-width: 1180px)");
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

  const pendingImportCount = pasteText.trim()
    ? parseScriptText(pasteText, {
        contactName: config.contact.name,
        viewerName: config.viewer.name
      }).length
    : 0;

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

  const applyScriptImport = () => {
    const parsed = parseScriptText(pasteText, {
      contactName: config.contact.name,
      viewerName: config.viewer.name
    }).map((message, index) => ({
      ...message,
      id: `imported-${Date.now()}-${index}`
    }));

    if (parsed.length === 0) {
      setIsPasteOpen(false);
      return;
    }

    const mergedMessages = (
      pasteReplace ? parsed : [...config.messages, ...parsed]
    ).slice(0, SCENE_MESSAGE_MAX_COUNT);

    onChange(
      normalizeConversationConfig({ ...config, messages: mergedMessages })
    );
    setIsPasteOpen(false);
    setPasteText("");
    setPasteReplace(false);
  };

  const saveChanges = () => {
    if (missingRequiredSettings.length > 0) {
      setSettingsWarning(formatRequiredSettingsWarning(missingRequiredSettings));
      setIsGeneralSettingsCollapsed(false);
      if (isSceneTitleMissing || isContactNameMissing || isViewerNameMissing) {
        setIsSettingsCollapsed(false);
      }
      if (!isWide) {
        setActivePanel("settings");
      }
      return;
    }

    setSettingsWarning("");
    void onSave();
  };

  const showSettings = isWide || activePanel === "settings";
  const showScript = isWide || activePanel === "script";
  const showPreview = isWide || activePanel === "preview";

  const settingsColumn = (
    <div className="grid min-w-0 content-start gap-4">
      <section className={panelClass}>
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
          className="font-display mb-3 flex min-w-0 items-center gap-2 rounded-xl px-1 py-1 text-left text-base font-semibold text-[var(--editor-heading)] transition hover:bg-[var(--editor-hover)]"
        >
          {isGeneralSettingsCollapsed ? (
            <ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" />
          ) : (
            <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />
          )}
          General Settings
        </button>
        {!isGeneralSettingsCollapsed ? (
          <div id="general-settings-content" className="grid min-w-0 gap-4">
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
                          ? "bg-[var(--editor-action)] text-[var(--editor-action-ink)] ring-[var(--editor-action)]"
                          : "bg-[var(--editor-panel-soft)] text-[var(--editor-heading)] ring-[var(--editor-border)] hover:bg-[var(--editor-button-hover)]"
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
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-dashed border-[var(--editor-border-strong)] bg-[var(--editor-panel-soft)] text-[var(--editor-heading)] transition hover:bg-[var(--editor-button-hover)]"
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                  </button>
                ) : null}
              </nav>
            </div>
          </div>
        ) : null}
      </section>

      <section className={panelClass}>
        <button
          type="button"
          aria-expanded={!isSettingsCollapsed}
          aria-label={`${
            isSettingsCollapsed ? "Expand" : "Collapse"
          } scene settings`}
          onClick={() =>
            setIsSettingsCollapsed((isCurrentlyCollapsed) => !isCurrentlyCollapsed)
          }
          className="font-display mb-3 flex min-w-0 items-center gap-2 rounded-xl px-1 py-1 text-left text-base font-semibold text-[var(--editor-heading)] transition hover:bg-[var(--editor-hover)]"
        >
          {isSettingsCollapsed ? (
            <ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" />
          ) : (
            <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />
          )}
          Scene &amp; cast
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

            <div className="grid gap-3 rounded-2xl border border-[var(--editor-border)] bg-[var(--editor-panel-soft)] p-3">
              <div className="flex items-center gap-3">
                <img
                  alt=""
                  className="h-16 w-16 rounded-full object-cover ring-2 ring-[var(--editor-border)]"
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
                  className={`${fieldClass} file:mr-3 file:rounded-full file:border-0 file:bg-[var(--editor-action)] file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-[var(--editor-action-ink)]`}
                  type="file"
                  onChange={(event) =>
                    openAvatarCropper(event, "contact", "Crop POV avatar")
                  }
                />
              </label>
            </div>

            <div className="grid gap-3 rounded-2xl border border-[var(--editor-border)] bg-[var(--editor-panel-soft)] p-3">
              <div className="flex items-center gap-3">
                <img
                  alt=""
                  className="h-16 w-16 rounded-full object-cover ring-2 ring-[var(--editor-border)]"
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
                  className={`${fieldClass} file:mr-3 file:rounded-full file:border-0 file:bg-[var(--editor-action)] file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-[var(--editor-action-ink)]`}
                  type="file"
                  onChange={(event) =>
                    openAvatarCropper(event, "viewer", "Crop speaker avatar")
                  }
                />
              </label>
            </div>

            <div className="border-t border-[var(--editor-border)] pt-3">
              <p className="font-display text-sm font-semibold text-[var(--editor-heading)]">
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
              <span className="mt-1 block text-xs font-normal normal-case tracking-normal text-[var(--editor-muted)]">
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
              <span className="mt-1 block text-xs font-normal normal-case tracking-normal text-[var(--editor-muted)]">
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
    </div>
  );

  const scriptColumn = (
    <section className="grid min-w-0 content-start gap-3">
      <div
        className={`rounded-2xl border p-4 shadow-[0_16px_40px_rgba(120,80,40,0.1)] ${
          isNearSceneLimit
            ? "border-amber-200 bg-amber-50/80 text-amber-950 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-200"
            : "border-[var(--editor-border)] bg-[var(--editor-panel)] text-[var(--editor-heading)]"
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--editor-track)] ring-1 ring-[var(--editor-border)]">
            <div
              className={`h-full rounded-full ${
                isNearSceneLimit
                  ? "bg-gradient-to-r from-amber-300 to-orange-400"
                  : "bg-gradient-to-r from-[var(--editor-accent)] to-[#79c0ff]"
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

      <div className="flex items-center justify-between gap-2">
        <p className="font-display text-base font-semibold text-[var(--editor-heading)]">
          Script
        </p>
        <button
          type="button"
          aria-label="Paste a script"
          onClick={() => setIsPasteOpen(true)}
          className="flex items-center gap-1.5 rounded-full bg-[var(--editor-panel-soft)] px-3.5 py-1.5 text-xs font-semibold text-[var(--editor-heading)] ring-1 ring-[var(--editor-border)] transition hover:bg-[var(--editor-button-hover)]"
        >
          <ClipboardPaste className="h-3.5 w-3.5" aria-hidden="true" />
          Paste script
        </button>
      </div>

      {config.messages.map((message, index) => {
        const isCollapsed = collapsedMessageIds.has(message.id);
        const isEmojiPickerOpen = activeEmojiPickerMessageId === message.id;
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
            className="min-w-0 rounded-2xl border border-[var(--editor-border)] bg-[var(--editor-panel)] p-4 shadow-[0_14px_36px_rgba(120,80,40,0.1)]"
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <button
                type="button"
                aria-expanded={!isCollapsed}
                aria-label={`${isCollapsed ? "Expand" : "Collapse"} line ${
                  index + 1
                }`}
                onClick={() => toggleMessageCollapsed(message.id)}
                className="flex min-w-0 flex-1 items-center gap-2 rounded-xl px-1 py-1 text-left text-xs font-bold uppercase tracking-[0.14em] text-[var(--editor-label)] transition hover:bg-[var(--editor-hover)]"
              >
                {isCollapsed ? (
                  <ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" />
                ) : (
                  <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />
                )}
                <span className="shrink-0">Line {index + 1}</span>
                <span className="truncate font-normal normal-case tracking-normal text-[var(--editor-muted)]">
                  {getMessageSpeakerInitial(message, config)}:{" "}
                  {message.text.trim() || "write something"}
                </span>
              </button>
              <button
                type="button"
                aria-label={`Delete line ${index + 1}`}
                title={`Delete line ${index + 1}`}
                onClick={() => onChange(removeConversationMessage(config, message.id))}
                className="grid h-8 w-8 place-items-center rounded-full bg-[var(--editor-panel-soft)] text-[var(--editor-muted)] ring-1 ring-[var(--editor-border)] transition hover:bg-[var(--editor-button-hover)]"
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
                              ? "bg-[var(--editor-field-missing)] placeholder:text-[var(--editor-placeholder-missing)]"
                              : ""
                          }`}
                          placeholder="write something"
                          value={message.text}
                          onBlur={() => {
                            window.setTimeout(() => {
                              setActiveEmojiAutocomplete((currentAutocomplete) =>
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
                          className="absolute left-0 top-20 z-20 grid w-[min(280px,calc(100vw-84px))] gap-2 rounded-2xl border border-[var(--editor-border)] bg-[var(--editor-popover)] p-3 shadow-2xl backdrop-blur-xl"
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
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() =>
                                  insertEmojiIntoMessage(message, entry.emoji)
                                }
                                className="grid h-10 place-items-center rounded-xl text-xl transition hover:bg-[var(--editor-hover)]"
                              >
                                {entry.emoji}
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {emojiAutocomplete ? (
                        <div>
                          <div className="grid w-[min(320px,100%)] gap-1 rounded-2xl border border-[var(--editor-border)] bg-[var(--editor-popover)] p-2 shadow-xl">
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
                                className="flex items-center gap-2 rounded-xl px-2 py-1.5 text-left text-sm font-semibold text-[var(--editor-ink)] transition hover:bg-[var(--editor-hover)]"
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
                            currentMessageId === message.id ? null : message.id
                          );
                        }}
                        className="grid h-7 w-7 place-items-center rounded-full text-[var(--editor-accent)] transition hover:bg-[var(--editor-hover)]"
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
                        className="grid h-7 w-7 place-items-center rounded-full text-[var(--editor-disabled-ink)] disabled:cursor-not-allowed"
                      >
                        <ImageIcon className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Add voice clip to line ${
                          index + 1
                        } (coming soon)`}
                        title="Voice clips coming soon"
                        disabled
                        className="grid h-7 w-7 place-items-center rounded-full text-[var(--editor-disabled-ink)] disabled:cursor-not-allowed"
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
                    <label className="flex items-center gap-2 text-sm font-semibold text-[var(--editor-ink)]">
                      <input
                        aria-label={`Line ${index + 1} use default typing time`}
                        checked={message.useDefaultTypingMs !== false}
                        className="h-4 w-4 rounded border-[var(--editor-border-strong)] accent-[var(--editor-accent)]"
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
                    <label className="flex items-center gap-2 text-sm font-semibold text-[var(--editor-ink)]">
                      <input
                        aria-label={`Line ${index + 1} use default pause time`}
                        checked={message.useDefaultPauseAfterMs !== false}
                        className="h-4 w-4 rounded border-[var(--editor-border-strong)] accent-[var(--editor-accent)]"
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

      <div className="rounded-2xl border border-[var(--editor-border)] bg-[var(--editor-panel-soft)] p-4 shadow-[0_14px_36px_rgba(120,80,40,0.1)]">
        <button
          type="button"
          aria-label="Add line"
          disabled={isAtSceneLimit}
          onClick={() => onChange(addConversationMessage(config))}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-full bg-[var(--editor-button)] px-4 text-sm font-semibold text-[var(--editor-heading)] ring-1 ring-[var(--editor-border)] transition hover:bg-[var(--editor-button-hover)] disabled:cursor-not-allowed disabled:bg-[var(--editor-disabled-bg)] disabled:text-[var(--editor-disabled-ink)]"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add line
        </button>
      </div>
    </section>
  );

  const previewColumn = (
    <section className="grid min-w-0 content-start gap-3">
      <p className="font-display text-base font-semibold text-[var(--editor-heading)]">
        Live preview
      </p>
      <ConversationPreview config={config} />
    </section>
  );

  return (
    <aside
      role="dialog"
      aria-label="Script editor"
      className="editor-theme fixed inset-0 z-50 flex flex-col overflow-x-hidden overflow-y-hidden bg-gradient-to-br from-[var(--editor-bg-from)] via-[var(--editor-bg-via)] to-[var(--editor-bg-to)] text-[var(--editor-ink)] shadow-[0_24px_80px_rgba(58,36,23,0.35)] md:left-20"
    >
      <div className="relative flex flex-wrap items-start justify-between gap-3 border-b border-[var(--editor-border)] bg-[var(--editor-header)] px-4 py-4 backdrop-blur-md sm:px-6 lg:px-8">
        <div className="min-w-0">
          <h2 className="font-display truncate text-3xl font-semibold tracking-normal text-[var(--editor-heading)]">
            Script editor
          </h2>
        </div>
        <div className="flex w-full min-w-0 flex-wrap items-center justify-start gap-2 sm:w-auto sm:justify-end">
          {isUnlocked ? (
            <button
              type="button"
              aria-label="Undo last edit"
              title="Undo last edit"
              disabled={!canUndo}
              onClick={onUndo}
              className="flex h-10 min-w-0 items-center justify-center gap-2 rounded-full bg-[var(--editor-button)] px-3 text-sm font-semibold text-[var(--editor-heading)] ring-1 ring-[var(--editor-border)] transition hover:bg-[var(--editor-button-hover)] disabled:cursor-not-allowed disabled:bg-[var(--editor-disabled-bg)] disabled:text-[var(--editor-disabled-ink)] sm:px-4"
            >
              <Undo2 className="h-4 w-4" aria-hidden="true" />
              Undo
            </button>
          ) : null}
          <button
            type="button"
            aria-label="Save changes"
            aria-busy={isSaving}
            title="Save changes"
            onClick={saveChanges}
            className="flex h-10 min-w-0 items-center justify-center gap-2 rounded-full bg-[var(--editor-action)] px-4 text-sm font-semibold text-[var(--editor-action-ink)] transition hover:bg-[var(--editor-action-hover)] sm:px-5"
          >
            <Check className="h-4 w-4" aria-hidden="true" />
            Save changes
          </button>
        </div>
      </div>

      {requiresPassword && !isUnlocked ? (
        <form
          onSubmit={unlock}
          className="mx-auto mt-16 w-[min(440px,calc(100vw-32px))] rounded-2xl border border-[var(--editor-border)] bg-[var(--editor-header)] p-5 shadow-xl backdrop-blur-md"
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
            <p className="mt-2 text-sm font-medium text-rose-700 dark:text-rose-300">{passwordError}</p>
          ) : null}
          <button
            type="submit"
            className="mt-4 h-11 w-full rounded-full bg-[var(--editor-action)] text-sm font-semibold text-[var(--editor-action-ink)] transition hover:bg-[var(--editor-action-hover)]"
          >
            Unlock editor
          </button>
        </form>
      ) : (
        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-3 py-5 sm:px-6 lg:px-8">
          <div className="mx-auto grid w-full max-w-7xl min-w-0 gap-4">
            {settingsWarning ? (
              <p className="rounded-xl border border-rose-200 bg-rose-50/80 px-3 py-2 text-sm font-semibold text-rose-800 dark:border-rose-400/25 dark:bg-rose-500/10 dark:text-rose-200">
                {settingsWarning}
              </p>
            ) : null}
            {saveError ? (
              <p className="rounded-xl border border-rose-200 bg-rose-50/80 px-3 py-2 text-sm font-semibold text-rose-800 dark:border-rose-400/25 dark:bg-rose-500/10 dark:text-rose-200">
                {saveError}
              </p>
            ) : null}

            {!isWide ? (
              <div
                role="tablist"
                aria-label="Editor sections"
                className="grid grid-cols-3 gap-1 rounded-full bg-[var(--editor-track)] p-1"
              >
                {PANEL_TABS.map((tab) => {
                  const isActive = activePanel === tab.id;

                  return (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      aria-label={`Show ${tab.label.toLowerCase()} panel`}
                      onClick={() => setActivePanel(tab.id)}
                      className={`rounded-full px-3 py-2 text-sm font-semibold transition ${
                        isActive
                          ? "bg-[var(--editor-action)] text-[var(--editor-action-ink)]"
                          : "text-[var(--editor-heading)] hover:bg-[var(--editor-hover)]"
                      }`}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            ) : null}

            <div
              className={
                isWide
                  ? "grid w-full min-w-0 items-start gap-4 [grid-template-columns:300px_minmax(0,1fr)_340px]"
                  : "grid min-w-0 gap-4"
              }
            >
              {showSettings ? settingsColumn : null}
              {showScript ? scriptColumn : null}
              {showPreview ? previewColumn : null}
            </div>
          </div>
        </div>
      )}

      {isPasteOpen ? (
        <div
          role="dialog"
          aria-label="Paste a script"
          className="fixed inset-0 z-[60] flex items-center justify-center bg-[var(--editor-overlay)] p-4 backdrop-blur-sm"
        >
          <div className="w-[min(460px,100%)] rounded-2xl border border-[var(--editor-border)] bg-[var(--editor-panel)] p-5 shadow-[0_30px_70px_rgba(40,24,12,0.4)]">
            <h3 className="font-display text-lg font-semibold text-[var(--editor-heading)]">
              Paste a script
            </h3>
            <p className="mt-1 text-sm text-[var(--editor-muted)]">
              One line each. Start a line with a name or <code>me:</code> /{" "}
              <code>you:</code> and I'll turn it into messages.
            </p>
            <textarea
              aria-label="Script text"
              className={`${fieldClass} mt-3 min-h-40 resize-y`}
              placeholder={"me: yo waddup\nyou: nm let's eat\nme: k let's go"}
              value={pasteText}
              onChange={(event) => setPasteText(event.target.value)}
            />
            <label className="mt-3 flex items-center gap-2 text-sm font-semibold text-[var(--editor-ink)]">
              <input
                aria-label="Replace existing lines"
                checked={pasteReplace}
                className="h-4 w-4 rounded border-[var(--editor-border-strong)] accent-[var(--editor-accent)]"
                type="checkbox"
                onChange={(event) => setPasteReplace(event.target.checked)}
              />
              Replace existing lines
            </label>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                aria-label="Cancel paste"
                onClick={() => {
                  setIsPasteOpen(false);
                  setPasteText("");
                  setPasteReplace(false);
                }}
                className="rounded-full bg-[var(--editor-button)] px-4 py-2 text-sm font-semibold text-[var(--editor-heading)] ring-1 ring-[var(--editor-border)] transition hover:bg-[var(--editor-button-hover)]"
              >
                Cancel
              </button>
              <button
                type="button"
                aria-label="Add pasted lines"
                disabled={pendingImportCount === 0}
                onClick={applyScriptImport}
                className="rounded-full bg-[var(--editor-action)] px-4 py-2 text-sm font-semibold text-[var(--editor-action-ink)] transition hover:bg-[var(--editor-action-hover)] disabled:cursor-not-allowed disabled:bg-[var(--editor-action-disabled)]"
              >
                {pendingImportCount > 0
                  ? `${pasteReplace ? "Replace with" : "Add"} ${pendingImportCount} ${
                      pendingImportCount === 1 ? "line" : "lines"
                    }`
                  : "Add lines"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

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
