import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw } from "lucide-react";
import type { PlaybackSpeed } from "../hooks/useScriptedConversation";

type StoryControlsProps = {
  hasStarted: boolean;
  isComplete: boolean;
  isPlaying: boolean;
  onNextScene: () => void;
  onPreviousScene: () => void;
  onReset: () => void;
  onTogglePlayback: () => void;
  onToggleSpeed: () => void;
  playbackSpeed: PlaybackSpeed;
  sceneCount: number;
  sceneIndex: number;
};

const pressFeedbackClass =
  "transition-all duration-150 ease-out will-change-transform active:scale-95 active:brightness-110 disabled:active:scale-100";

export function StoryControls({
  hasStarted,
  isComplete,
  isPlaying,
  onNextScene,
  onPreviousScene,
  onReset,
  onTogglePlayback,
  onToggleSpeed,
  playbackSpeed,
  sceneCount,
  sceneIndex
}: StoryControlsProps) {
  const primaryLabel = isComplete ? "Replay" : isPlaying ? "Pause" : "Play";
  const primaryAccessibleLabel = `${primaryLabel} conversation`;
  const canReset = hasStarted || isComplete;
  const canGoPrevious = sceneIndex > 1;
  const canGoNext = sceneIndex < sceneCount;

  return (
    <nav
      aria-label="Story controls"
      className="grid w-[min(344px,calc(100vw-40px))] shrink-0 grid-cols-4 gap-1.5 rounded-full border border-white/35 bg-slate-950/15 p-1.5 shadow-[0_18px_48px_rgba(79,70,229,0.22)] backdrop-blur-2xl"
    >
      <button
        type="button"
        aria-label="Restart conversation"
        title="Restart conversation"
        disabled={!canReset}
        onClick={onReset}
        className={`flex h-9 min-w-0 items-center justify-center rounded-full bg-gradient-to-br from-rose-200/80 via-orange-100/75 to-white/60 px-2 text-rose-950 shadow-sm ring-1 ring-white/55 hover:from-rose-200 disabled:cursor-not-allowed disabled:opacity-35 ${pressFeedbackClass}`}
      >
        <RotateCcw className="h-4 w-4" aria-hidden="true" />
      </button>
      <button
        type="button"
        aria-label={primaryAccessibleLabel}
        title={primaryAccessibleLabel}
        onClick={onTogglePlayback}
        className={`flex h-9 min-w-0 items-center justify-center gap-1 rounded-full bg-gradient-to-br from-violet-400/85 via-fuchsia-300/80 to-sky-200/75 px-2 text-[11px] font-bold text-white shadow-sm ring-1 ring-white/55 hover:from-violet-300 ${pressFeedbackClass}`}
      >
        {isComplete ? (
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
        ) : isPlaying ? (
          <Pause className="h-3.5 w-3.5" aria-hidden="true" />
        ) : (
          <Play className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        {primaryLabel}
      </button>
      <button
        type="button"
        aria-label={`Playback speed ${playbackSpeed}x`}
        title={`Playback speed ${playbackSpeed}x`}
        onClick={onToggleSpeed}
        className={`flex h-9 min-w-0 items-center justify-center rounded-full bg-gradient-to-br from-cyan-300/80 via-teal-200/75 to-emerald-200/70 px-2 text-[11px] font-bold text-slate-950 shadow-sm ring-1 ring-white/55 hover:from-cyan-200 ${pressFeedbackClass}`}
      >
        {playbackSpeed}x
      </button>
      <div className="flex h-9 min-w-0 items-center justify-between gap-0.5 rounded-full bg-gradient-to-br from-slate-950 via-indigo-950 to-fuchsia-900 px-1 text-white shadow-sm ring-1 ring-fuchsia-200/25">
        <button
          type="button"
          aria-label="Previous scene"
          title="Previous scene"
          disabled={!canGoPrevious}
          onClick={onPreviousScene}
          className={`grid h-7 w-6 shrink-0 place-items-center rounded-full hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-30 ${pressFeedbackClass}`}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <span
          className="min-w-0 px-0.5 text-[11px] font-bold tabular-nums"
          aria-label={`Scene ${sceneIndex} of ${sceneCount}`}
        >
          {sceneIndex}/{sceneCount}
        </span>
        <button
          type="button"
          aria-label="Next scene"
          title="Next scene"
          disabled={!canGoNext}
          onClick={onNextScene}
          className={`grid h-7 w-6 shrink-0 place-items-center rounded-full hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-30 ${pressFeedbackClass}`}
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
}
