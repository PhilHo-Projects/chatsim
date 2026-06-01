import { RotateCcw } from "lucide-react";

type ReplayButtonProps = {
  isVisible: boolean;
  onReplay: () => void;
};

export function ReplayButton({ isVisible, onReplay }: ReplayButtonProps) {
  if (!isVisible) {
    return null;
  }

  return (
    <div className="border-t border-slate-200/80 bg-white px-4 py-3">
      <button
        type="button"
        aria-label="Replay conversation"
        title="Replay conversation"
        onClick={onReplay}
        className="mx-auto flex h-11 items-center justify-center gap-2 rounded-full bg-slate-950 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
      >
        <RotateCcw className="h-4 w-4" aria-hidden="true" />
        Replay
      </button>
    </div>
  );
}
