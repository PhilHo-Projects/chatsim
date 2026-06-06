import { useState } from "react";
import { Play, RotateCcw, Square } from "lucide-react";
import type { ConversationConfig } from "../data/conversationConfig";
import { useScriptedConversation } from "../hooks/useScriptedConversation";

type ConversationPreviewProps = {
  config: ConversationConfig;
};

/**
 * A faithful, self-contained preview of a phone conversation.
 *
 * Static by default (every bubble shown, always in sync with the script); a
 * Play button replays the real animated timeline on demand. Kept deliberately
 * free of heading roles, "<name> avatar" labels, and literal status text so it
 * never collides with the live player rendered behind the editor overlay.
 */
export function ConversationPreview({ config }: ConversationPreviewProps) {
  const [isPlaying, setIsPlaying] = useState(false);

  const conversation = useScriptedConversation(config.messages, {
    autoPlay: isPlaying,
    contactName: config.viewer.name,
    povTypingSpeedLevel: config.contact.typingSpeedLevel,
    defaultSpeakerTypingSpeedLevel: config.defaultSpeakerTypingSpeedLevel,
    defaultPauseAfterMs: config.defaultPauseAfterMs
  });

  const messages = isPlaying ? conversation.visibleMessages : config.messages;
  const showTypingIndicator = isPlaying && conversation.isContactTyping;
  const draftText =
    isPlaying && conversation.status === "typing-outgoing"
      ? conversation.draftText
      : "";

  const viewerInitial =
    config.viewer.initials.trim().charAt(0).toUpperCase() ||
    config.viewer.name.trim().charAt(0).toUpperCase() ||
    "?";

  return (
    <div className="grid gap-3" data-testid="conversation-preview">
      <div className="mx-auto w-full max-w-[320px] rounded-[34px] border-[7px] border-[#1c1410] bg-[#1c1410] shadow-[0_20px_50px_rgba(40,24,12,0.4)]">
        <div className="flex h-[440px] flex-col overflow-hidden rounded-[26px] border border-white/40 bg-white/55 backdrop-blur-2xl">
          {/* header — the person you're texting (the viewer), no heading role */}
          <div className="flex items-center gap-2.5 border-b border-black/5 bg-white/70 px-3.5 py-2.5">
            {config.viewer.avatarUrl ? (
              <img
                alt=""
                aria-hidden="true"
                src={config.viewer.avatarUrl}
                className="h-8 w-8 rounded-full object-cover ring-2 ring-white"
              />
            ) : (
              <span
                aria-hidden="true"
                className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-[#cf8b46] to-[#7a4f24] text-xs font-bold text-white"
              >
                {viewerInitial}
              </span>
            )}
            <div className="min-w-0">
              <p className="latte-display truncate text-sm font-semibold text-slate-800">
                {config.viewer.name}
              </p>
              <span className="flex items-center gap-1 text-[10px] text-slate-500">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                active
              </span>
            </div>
          </div>

          {/* body */}
          <ol className="flex min-h-0 flex-1 flex-col justify-end gap-2 overflow-y-auto px-3 py-4">
            {messages.map((message) => {
              const isPov = message.speaker === "contact";

              return (
                <li
                  key={message.id}
                  className={`flex ${isPov ? "justify-end" : "justify-start"}`}
                >
                  <span
                    className={`max-w-[80%] whitespace-pre-wrap rounded-[20px] px-3.5 py-2 text-[13px] leading-snug shadow-sm [overflow-wrap:anywhere] ${
                      isPov
                        ? "rounded-br-md bg-[#1769d2]/95 text-white"
                        : "rounded-bl-md bg-white/85 text-slate-900 ring-1 ring-white/70"
                    }`}
                  >
                    {message.text || " "}
                  </span>
                </li>
              );
            })}
            {showTypingIndicator ? (
              <li className="flex justify-start">
                <span className="flex items-center gap-1 rounded-[20px] rounded-bl-md bg-white/85 px-3.5 py-2.5 ring-1 ring-white/70">
                  {[0, 1, 2].map((dot) => (
                    <span
                      key={dot}
                      className="h-1.5 w-1.5 rounded-full bg-slate-400"
                      style={{ animation: `typing-dot 1.1s ${dot * 0.15}s infinite` }}
                    />
                  ))}
                </span>
              </li>
            ) : null}
          </ol>

          {/* composer — shows the POV's draft while they "type" */}
          <div className="flex items-center gap-2 border-t border-black/5 bg-white/70 px-3 py-2.5">
            <div className="min-h-[30px] flex-1 rounded-full bg-white/80 px-3.5 py-1.5 text-[13px] text-slate-700 ring-1 ring-black/5">
              {draftText ? (
                <span>
                  {draftText}
                  <span className="ml-0.5 inline-block h-3.5 w-px translate-y-0.5 animate-pulse bg-slate-500" />
                </span>
              ) : (
                <span className="text-slate-400">Message…</span>
              )}
            </div>
            <span
              aria-hidden="true"
              className="grid h-7 w-7 place-items-center rounded-full bg-[#1769d2] text-white"
            >
              <Play className="h-3.5 w-3.5" />
            </span>
          </div>
        </div>
      </div>

      {/* controls */}
      <div className="flex items-center justify-center gap-2">
        {isPlaying ? (
          <>
            <button
              type="button"
              aria-label="Restart preview animation"
              onClick={() => conversation.replay()}
              className="flex items-center gap-1.5 rounded-full bg-[var(--latte-espresso)] px-3.5 py-1.5 text-xs font-semibold text-[#f6ead7] transition hover:opacity-90"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              Restart
            </button>
            <button
              type="button"
              aria-label="Stop preview animation"
              onClick={() => setIsPlaying(false)}
              className="flex items-center gap-1.5 rounded-full bg-white/80 px-3.5 py-1.5 text-xs font-semibold text-[var(--latte-heading)] ring-1 ring-[var(--latte-border)] transition hover:bg-white"
            >
              <Square className="h-3 w-3" aria-hidden="true" />
              Stop
            </button>
          </>
        ) : (
          <button
            type="button"
            aria-label="Play preview animation"
            onClick={() => setIsPlaying(true)}
            className="flex items-center gap-1.5 rounded-full bg-[var(--latte-espresso)] px-4 py-1.5 text-xs font-semibold text-[#f6ead7] transition hover:opacity-90"
          >
            <Play className="h-3.5 w-3.5" aria-hidden="true" />
            Play animation
          </button>
        )}
      </div>
    </div>
  );
}
