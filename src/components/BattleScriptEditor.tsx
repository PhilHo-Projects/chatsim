import type { FormEvent } from "react";
import { useState } from "react";
import { Check, Plus, Swords, Trash2, Undo2 } from "lucide-react";
import {
  addConversationMessage,
  EDITOR_PASSWORD,
  isEditorUnlockValid,
  normalizeConversationConfig,
  rememberEditorUnlock,
  removeConversationMessage,
  updateConversationMessage,
  type ConversationConfig,
  type SpeakerId,
  type SpeedLevel
} from "../data/conversationConfig";

type BattleScriptEditorProps = {
  canUndo: boolean;
  config: ConversationConfig;
  isSaving?: boolean;
  onChange: (config: ConversationConfig) => void;
  onClose: () => void;
  onSave?: () => void | Promise<void>;
  onStoryTitleChange: (title: string) => void;
  onUndo: () => void;
  requiresPassword?: boolean;
  saveError?: string;
  storyTitle: string;
};

// In a battle: viewer = the opponent on top, contact = the player at the bottom.
const OPPONENT: SpeakerId = "viewer";
const PLAYER: SpeakerId = "contact";

const SPEED_OPTIONS: { value: SpeedLevel; label: string }[] = [
  { value: 1, label: "1 — slow crawl" },
  { value: 2, label: "2 — steady" },
  { value: 3, label: "3 — normal" },
  { value: 4, label: "4 — snappy" },
  { value: 5, label: "5 — blazing" }
];

// Warm Latte editor conventions, shared with the phone editor (ScriptEditor.tsx)
// and src/styles/latte.css. Reusing the same field/label/panel tokens keeps both
// editors reading as one product: cream panels, caramel accents, espresso ink.
const fieldClass =
  "w-full min-w-0 rounded-xl border border-[var(--latte-field-border)] bg-[var(--latte-field)] px-3 py-2 text-sm text-[var(--latte-ink)] shadow-inner outline-none transition placeholder:text-[#b89a78] focus:border-[var(--latte-caramel)] focus:ring-2 focus:ring-[#eaddc6] disabled:cursor-not-allowed disabled:bg-[#f1e8da] disabled:text-[#b3a08a]";

const labelClass =
  "text-xs font-semibold uppercase tracking-[0.08em] text-[var(--latte-label)]";

const panelClass =
  "rounded-2xl border border-[var(--latte-border)] bg-[var(--latte-panel)] p-4 shadow-[0_16px_40px_rgba(120,80,40,0.12)]";

const primaryButtonClass =
  "inline-flex h-10 items-center justify-center gap-2 rounded-full bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50";

const secondaryButtonClass =
  "inline-flex h-10 items-center justify-center gap-2 rounded-full bg-white/80 px-4 text-sm font-semibold text-[var(--latte-heading)] ring-1 ring-[var(--latte-border)] transition hover:bg-white disabled:cursor-not-allowed disabled:bg-[#f1e8da] disabled:text-[#b3a08a]";

function clampSpeedLevel(value: number): SpeedLevel {
  return Math.min(5, Math.max(1, value || 3)) as SpeedLevel;
}

function HeartGauge({ tone }: { tone: "opponent" | "player" }) {
  // A warm nod to the in-battle nameplate hearts, tinted to each trainer.
  return (
    <span
      aria-hidden="true"
      className={`shrink-0 text-[10px] tracking-[0.18em] ${
        tone === "opponent" ? "text-[var(--latte-caramel)]" : "text-[#c98aa0]"
      }`}
    >
      ♥ ♥ ♥
    </span>
  );
}

export function BattleScriptEditor({
  canUndo,
  config,
  isSaving = false,
  onChange,
  onClose,
  onSave = onClose,
  onStoryTitleChange,
  onUndo,
  requiresPassword = true,
  saveError = "",
  storyTitle
}: BattleScriptEditorProps) {
  const [isUnlocked, setIsUnlocked] = useState(
    () => !requiresPassword || isEditorUnlockValid()
  );
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");

  const speedLevel = config.contact.typingSpeedLevel;

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

  const setTrainerName = (role: SpeakerId, value: string) => {
    onChange(
      normalizeConversationConfig({
        ...config,
        [role]: {
          ...config[role],
          name: value,
          initials: value.trim().charAt(0).toUpperCase() || config[role].initials
        }
      })
    );
  };

  const setBattleSpeed = (level: SpeedLevel) => {
    onChange(
      normalizeConversationConfig({
        ...config,
        contact: {
          ...config.contact,
          typingSpeedLevel: level
        },
        defaultSpeakerTypingSpeedLevel: level
      })
    );
  };

  return (
    <aside
      role="dialog"
      aria-label="Battle editor"
      data-testid="battle-script-editor"
      className="latte-editor fixed inset-0 z-50 flex flex-col overflow-hidden bg-gradient-to-br from-[var(--latte-bg-from)] via-[var(--latte-bg-via)] to-[var(--latte-bg-to)] text-[var(--latte-ink)] shadow-[0_24px_80px_rgba(58,36,23,0.35)]"
    >
      {/* Header mirrors the phone editor's warm bar; the Swords badge keeps battle identity. */}
      <div className="relative flex flex-wrap items-center justify-between gap-3 border-b border-[var(--latte-border)] bg-[#fffdf8]/85 px-4 py-4 backdrop-blur-md sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-[var(--latte-border)] bg-[var(--latte-panel-soft)] text-[var(--latte-caramel)] shadow-[0_10px_24px_rgba(120,80,40,0.14)]">
            <Swords className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="latte-display truncate text-3xl font-semibold tracking-normal text-[var(--latte-heading)]">
              Battle editor
            </h2>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isUnlocked ? (
            <button
              type="button"
              aria-label="Undo last edit"
              title="Undo last edit"
              disabled={!canUndo}
              onClick={onUndo}
              className={secondaryButtonClass}
            >
              <Undo2 className="h-4 w-4" aria-hidden="true" />
              Undo
            </button>
          ) : null}
          <button
            type="button"
            aria-label="Done editing"
            aria-busy={isSaving}
            title="Done editing"
            onClick={() => void onSave()}
            className={primaryButtonClass}
          >
            <Check className="h-4 w-4" aria-hidden="true" />
            Done
          </button>
        </div>
      </div>

      {requiresPassword && !isUnlocked ? (
        <form
          onSubmit={unlock}
          className="mx-auto mt-16 w-[min(420px,calc(100vw-32px))] rounded-2xl border border-[var(--latte-border)] bg-[#fffdf8]/85 p-5 shadow-xl backdrop-blur-md"
        >
          <label className={labelClass} htmlFor="battle-editor-password">
            Editor password
          </label>
          <input
            id="battle-editor-password"
            aria-label="Editor password"
            className={`${fieldClass} mt-1`}
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
            className={`${primaryButtonClass} mt-4 w-full`}
          >
            Unlock editor
          </button>
        </form>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-5 sm:px-6 lg:px-8">
          <div className="mx-auto grid w-full max-w-3xl gap-5">
            {saveError ? (
              <p className="rounded-xl border border-rose-200 bg-rose-50/80 px-3 py-2 text-sm font-semibold text-rose-800">
                {saveError}
              </p>
            ) : null}

            {/* Match-up settings */}
            <section className={`${panelClass} grid gap-4`}>
              <label className={labelClass} htmlFor="battle-story-title">
                Battle name
                <input
                  id="battle-story-title"
                  data-testid="battle-editor-title"
                  className={`${fieldClass} mt-1`}
                  value={storyTitle}
                  onChange={(event) => onStoryTitleChange(event.target.value)}
                  placeholder="Battle"
                />
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                {/* Opponent nameplate — soft latte panel with a warm heart gauge. */}
                <div className="overflow-hidden rounded-2xl border border-[var(--latte-border)] shadow-[0_14px_36px_rgba(120,80,40,0.1)]">
                  <div className="flex items-center justify-between gap-2 bg-[var(--latte-panel-soft)] px-3 py-2">
                    <label
                      className={labelClass}
                      htmlFor="battle-opponent-name"
                    >
                      Opponent · top
                    </label>
                    <HeartGauge tone="opponent" />
                  </div>
                  <div className="bg-[var(--latte-panel)] p-3">
                    <input
                      id="battle-opponent-name"
                      data-testid="battle-editor-opponent-name"
                      className={fieldClass}
                      value={config[OPPONENT].name}
                      onChange={(event) =>
                        setTrainerName(OPPONENT, event.target.value)
                      }
                      placeholder="Phil"
                    />
                  </div>
                </div>

                {/* Player nameplate — soft latte panel with a warm heart gauge. */}
                <div className="overflow-hidden rounded-2xl border border-[var(--latte-border)] shadow-[0_14px_36px_rgba(120,80,40,0.1)]">
                  <div className="flex items-center justify-between gap-2 bg-[var(--latte-panel-soft)] px-3 py-2">
                    <label
                      className={labelClass}
                      htmlFor="battle-player-name"
                    >
                      Player · bottom
                    </label>
                    <HeartGauge tone="player" />
                  </div>
                  <div className="bg-[var(--latte-panel)] p-3">
                    <input
                      id="battle-player-name"
                      data-testid="battle-editor-player-name"
                      className={fieldClass}
                      value={config[PLAYER].name}
                      onChange={(event) =>
                        setTrainerName(PLAYER, event.target.value)
                      }
                      placeholder="Nor"
                    />
                  </div>
                </div>
              </div>

              <label className={labelClass} htmlFor="battle-speed">
                Typing speed
                <select
                  id="battle-speed"
                  data-testid="battle-editor-speed"
                  className={`${fieldClass} mt-1`}
                  value={speedLevel}
                  onChange={(event) =>
                    setBattleSpeed(clampSpeedLevel(Number(event.target.value)))
                  }
                >
                  {SPEED_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </section>

            {/* Dialogue lines */}
            <section className="grid gap-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="latte-display text-base font-semibold text-[var(--latte-heading)]">
                  Dialogue
                </h3>
                <span className="inline-flex items-center rounded-full bg-[var(--latte-panel-soft)] px-3 py-1 text-xs font-semibold text-[var(--latte-heading)] ring-1 ring-[var(--latte-border)]">
                  {config.messages.length} lines
                </span>
              </div>

              <ul className="grid gap-3" data-testid="battle-editor-lines">
                {config.messages.map((message, index) => {
                  const isOpponent = message.speaker === OPPONENT;

                  return (
                    <li
                      key={message.id}
                      className="grid gap-2.5 rounded-2xl border border-[var(--latte-border)] bg-[var(--latte-panel)] p-3 shadow-[0_14px_36px_rgba(120,80,40,0.1)]"
                    >
                      <div className="flex items-center justify-between gap-2">
                        {/* Speaker toggle styled as a two-segment latte switch. */}
                        <div className="inline-flex overflow-hidden rounded-full border border-[var(--latte-border)]">
                          <button
                            type="button"
                            onClick={() =>
                              onChange(
                                updateConversationMessage(config, message.id, {
                                  speaker: OPPONENT
                                })
                              )
                            }
                            className={`px-3 py-1 text-xs font-semibold transition ${
                              isOpponent
                                ? "bg-slate-950 text-white"
                                : "bg-[var(--latte-panel-soft)] text-[var(--latte-muted)] hover:bg-white"
                            }`}
                          >
                            Opponent
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              onChange(
                                updateConversationMessage(config, message.id, {
                                  speaker: PLAYER
                                })
                              )
                            }
                            className={`border-l border-[var(--latte-border)] px-3 py-1 text-xs font-semibold transition ${
                              isOpponent
                                ? "bg-[var(--latte-panel-soft)] text-[var(--latte-muted)] hover:bg-white"
                                : "bg-slate-950 text-white"
                            }`}
                          >
                            Player
                          </button>
                        </div>
                        <button
                          type="button"
                          aria-label={`Delete line ${index + 1}`}
                          title="Delete line"
                          onClick={() =>
                            onChange(removeConversationMessage(config, message.id))
                          }
                          className="grid h-8 w-8 place-items-center rounded-full bg-[var(--latte-panel-soft)] text-[var(--latte-muted)] ring-1 ring-[var(--latte-border)] transition hover:bg-white"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>
                      {/* The line itself — drawn like an in-battle dialogue box. */}
                      <div className="relative">
                        <textarea
                          aria-label={`Line ${index + 1} text`}
                          className={`${fieldClass} min-h-[3.25rem] resize-y pr-7 leading-snug`}
                          value={message.text}
                          rows={2}
                          onChange={(event) =>
                            onChange(
                              updateConversationMessage(config, message.id, {
                                text: event.target.value
                              })
                            )
                          }
                          placeholder="What does this trainer say?"
                        />
                        <span
                          aria-hidden="true"
                          className="pointer-events-none absolute bottom-1.5 right-2 text-[10px] text-[var(--latte-muted)]"
                        >
                          ▼
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>

              <button
                type="button"
                data-testid="battle-editor-add-line"
                onClick={() => onChange(addConversationMessage(config))}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-full border border-dashed border-[#cbb290] bg-[var(--latte-panel-soft)] text-sm font-semibold text-[var(--latte-heading)] transition hover:bg-white"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add line
              </button>
            </section>
          </div>
        </div>
      )}
    </aside>
  );
}
