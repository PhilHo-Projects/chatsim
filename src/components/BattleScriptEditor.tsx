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

// Palette lifted from BattleStoryPlayer so the editor reads as the same game:
// cream parchment surfaces, royal-blue nameplates, gold accents, navy ink.
const inputClass =
  "w-full min-w-0 rounded-[4px] border-2 border-[#1b2a4a]/70 bg-[#fffdf4] px-3 py-2 font-round text-sm font-medium text-[#21314f] outline-none transition placeholder:text-[#21314f]/35 focus:border-[#2f4f9e] focus:ring-2 focus:ring-[#ffd93b]";

const labelClass = "font-pixel text-[10px] leading-loose text-[#2f4f9e]";

// Retro buttons "press" into the page: a hard offset shadow that collapses on
// click, like a chunky GameBoy menu button.
const goldButtonClass =
  "inline-flex h-11 items-center gap-2 rounded-[4px] border-[3px] border-[#1b2a4a] bg-[#ffd93b] px-4 font-pixel text-[11px] text-[#21314f] shadow-[4px_4px_0_#1b2a4a] transition hover:bg-[#ffe372] active:translate-x-[3px] active:translate-y-[3px] active:shadow-none disabled:cursor-not-allowed disabled:opacity-50";

const creamButtonClass =
  "inline-flex h-11 items-center gap-2 rounded-[4px] border-[3px] border-[#1b2a4a] bg-[#fdf6df] px-4 font-pixel text-[11px] text-[#21314f] shadow-[4px_4px_0_#1b2a4a] transition hover:bg-[#fffaf0] active:translate-x-[3px] active:translate-y-[3px] active:shadow-none disabled:cursor-not-allowed disabled:opacity-40";

const panelClass =
  "rounded-[8px] border-[3px] border-[#1b2a4a] bg-[#fdf6df] shadow-[6px_6px_0_rgba(27,42,74,0.18)]";

function clampSpeedLevel(value: number): SpeedLevel {
  return Math.min(5, Math.max(1, value || 3)) as SpeedLevel;
}

function HeartGauge({ tone }: { tone: "opponent" | "player" }) {
  // Echoes the in-battle nameplate hearts; tinted to the trainer's sprite.
  return (
    <span
      aria-hidden="true"
      className={`shrink-0 text-[9px] tracking-[0.18em] drop-shadow-[1px_1px_0_rgba(0,0,0,0.35)] ${
        tone === "opponent" ? "text-[#aef07d]" : "text-[#ff8da3]"
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
      className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-[linear-gradient(180deg,#bfe7f6_0%,#d9eede_34%,#cfe6b4_72%,#bedc9c_100%)] font-round text-[#21314f]"
    >
      {/* Retro CRT scanlines + vignette, matching the battlefield's texture. */}
      <div className="pointer-events-none absolute inset-0 z-0 bg-[repeating-linear-gradient(180deg,rgba(255,255,255,0.05)_0_3px,rgba(27,42,74,0.04)_3px_4px)]" />
      <div className="pointer-events-none absolute inset-0 z-0 shadow-[inset_0_0_70px_rgba(27,42,74,0.16)]" />

      {/* Header — styled like an in-battle nameplate (royal blue, cream text). */}
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 border-b-[4px] border-[#1b2a4a] bg-[#2f4f9e] px-4 py-4 text-[#fdf6df] shadow-[0_4px_0_rgba(27,42,74,0.35)] sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[6px] border-[3px] border-[#1b2a4a] bg-[#ffd93b] text-[#21314f] shadow-[3px_3px_0_#1b2a4a]">
            <Swords className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate font-pixel text-base text-[#fdf6df] drop-shadow-[2px_2px_0_rgba(27,42,74,0.6)] sm:text-lg">
              Battle Editor
              <span
                aria-hidden="true"
                className="ml-2 inline-block text-[#ffd93b] [animation:battle-blink_1s_steps(1,end)_infinite]"
              >
                ▼
              </span>
            </h2>
            <p className="mt-1 text-xs font-medium text-[#cdddfb]">
              Both trainers type their lines out loud.
            </p>
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
              className={creamButtonClass}
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
            className={goldButtonClass}
          >
            <Check className="h-4 w-4" aria-hidden="true" />
            Done
          </button>
        </div>
      </div>

      {requiresPassword && !isUnlocked ? (
        <form
          onSubmit={unlock}
          className={`relative z-10 mx-auto mt-16 w-[min(420px,calc(100vw-32px))] p-5 ${panelClass}`}
        >
          <label className={labelClass} htmlFor="battle-editor-password">
            Editor password
          </label>
          <input
            id="battle-editor-password"
            aria-label="Editor password"
            className={`${inputClass} mt-1`}
            value={password}
            inputMode="numeric"
            type="password"
            onChange={(event) => setPassword(event.target.value)}
          />
          {passwordError ? (
            <p className="mt-2 font-round text-sm font-semibold text-[#c0344c]">
              {passwordError}
            </p>
          ) : null}
          <button type="submit" className={`${goldButtonClass} mt-4 w-full justify-center`}>
            Unlock editor
          </button>
        </form>
      ) : (
        <div className="relative z-10 min-h-0 flex-1 overflow-y-auto px-3 py-5 sm:px-6">
          <div className="mx-auto grid w-full max-w-3xl gap-5">
            {saveError ? (
              <p className="rounded-[6px] border-[3px] border-[#c0344c] bg-[#ffe2e6] px-3 py-2 font-round text-sm font-semibold text-[#8f1f33]">
                {saveError}
              </p>
            ) : null}

            {/* Match-up settings */}
            <section className={`grid gap-4 p-4 ${panelClass}`}>
              <div className="grid gap-1">
                <label className={labelClass} htmlFor="battle-story-title">
                  Battle name
                </label>
                <input
                  id="battle-story-title"
                  data-testid="battle-editor-title"
                  className={inputClass}
                  value={storyTitle}
                  onChange={(event) => onStoryTitleChange(event.target.value)}
                  placeholder="Battle"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {/* Opponent nameplate — green accent echoes Phil's sprite hair. */}
                <div className="overflow-hidden rounded-[6px] border-[3px] border-[#1b2a4a] shadow-[4px_4px_0_rgba(27,42,74,0.18)]">
                  <div className="flex items-center justify-between gap-2 bg-[#2f4f9e] px-2.5 py-1.5">
                    <label
                      className="font-pixel text-[9px] text-[#fdf6df]"
                      htmlFor="battle-opponent-name"
                    >
                      Opponent · top
                    </label>
                    <HeartGauge tone="opponent" />
                  </div>
                  <div className="bg-[#fffdf4] p-2.5">
                    <input
                      id="battle-opponent-name"
                      data-testid="battle-editor-opponent-name"
                      className={inputClass}
                      value={config[OPPONENT].name}
                      onChange={(event) =>
                        setTrainerName(OPPONENT, event.target.value)
                      }
                      placeholder="Phil"
                    />
                  </div>
                </div>

                {/* Player nameplate — coral accent echoes Nor's sprite top. */}
                <div className="overflow-hidden rounded-[6px] border-[3px] border-[#1b2a4a] shadow-[4px_4px_0_rgba(27,42,74,0.18)]">
                  <div className="flex items-center justify-between gap-2 bg-[#2f4f9e] px-2.5 py-1.5">
                    <label
                      className="font-pixel text-[9px] text-[#fdf6df]"
                      htmlFor="battle-player-name"
                    >
                      Player · bottom
                    </label>
                    <HeartGauge tone="player" />
                  </div>
                  <div className="bg-[#fffdf4] p-2.5">
                    <input
                      id="battle-player-name"
                      data-testid="battle-editor-player-name"
                      className={inputClass}
                      value={config[PLAYER].name}
                      onChange={(event) =>
                        setTrainerName(PLAYER, event.target.value)
                      }
                      placeholder="Nor"
                    />
                  </div>
                </div>
              </div>

              <div className="grid gap-1">
                <label className={labelClass} htmlFor="battle-speed">
                  Typing speed
                </label>
                <select
                  id="battle-speed"
                  data-testid="battle-editor-speed"
                  className={inputClass}
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
              </div>
            </section>

            {/* Dialogue lines */}
            <section className="grid gap-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-pixel text-[12px] text-[#2f4f9e]">Dialogue</h3>
                <span className="inline-flex items-center rounded-[4px] border-2 border-[#1b2a4a] bg-[#ffd93b] px-2 py-0.5 font-pixel text-[9px] text-[#21314f] shadow-[2px_2px_0_#1b2a4a]">
                  {config.messages.length} lines
                </span>
              </div>

              <ul className="grid gap-3" data-testid="battle-editor-lines">
                {config.messages.map((message, index) => {
                  const isOpponent = message.speaker === OPPONENT;

                  return (
                    <li
                      key={message.id}
                      className={`grid gap-2.5 p-3 ${panelClass}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        {/* Speaker toggle styled as a two-segment battle switch. */}
                        <div className="inline-flex overflow-hidden rounded-[4px] border-[2px] border-[#1b2a4a] shadow-[2px_2px_0_rgba(27,42,74,0.2)]">
                          <button
                            type="button"
                            onClick={() =>
                              onChange(
                                updateConversationMessage(config, message.id, {
                                  speaker: OPPONENT
                                })
                              )
                            }
                            className={`px-3 py-1 font-pixel text-[9px] transition ${
                              isOpponent
                                ? "bg-[#ffd93b] text-[#21314f]"
                                : "bg-[#fdf6df] text-[#2f4f9e]/55 hover:bg-[#fffaf0]"
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
                            className={`border-l-[2px] border-[#1b2a4a] px-3 py-1 font-pixel text-[9px] transition ${
                              isOpponent
                                ? "bg-[#fdf6df] text-[#2f4f9e]/55 hover:bg-[#fffaf0]"
                                : "bg-[#ffd93b] text-[#21314f]"
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
                          className="grid h-8 w-8 place-items-center rounded-[4px] border-2 border-[#c0344c] bg-[#fff1f3] text-[#c0344c] shadow-[2px_2px_0_rgba(192,52,76,0.3)] transition hover:bg-[#ffd9df] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>
                      {/* The line itself — drawn like an in-battle dialogue box. */}
                      <div className="relative">
                        <textarea
                          aria-label={`Line ${index + 1} text`}
                          className={`${inputClass} min-h-[3.25rem] resize-y bg-[#f7f0d8] pr-7 leading-snug`}
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
                          className="pointer-events-none absolute bottom-1.5 right-2 text-[10px] text-[#1b2a4a]/55"
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
                className="flex h-11 items-center justify-center gap-2 rounded-[6px] border-[3px] border-dashed border-[#3f8f3a] bg-[#e9f6d8]/70 font-pixel text-[10px] text-[#2f6b2c] shadow-[3px_3px_0_rgba(63,143,58,0.25)] transition hover:bg-[#dcefc4] active:translate-x-[3px] active:translate-y-[3px] active:shadow-none"
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
