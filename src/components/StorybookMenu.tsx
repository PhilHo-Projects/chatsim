import { BookOpen, Check, Edit3, Plus, Trash2, X } from "lucide-react";
import type { PlatformStoryCard, PlatformStoryRecord } from "../data/platformSeed";

type StorybookMenuProps = {
  activeOwnerStories: PlatformStoryCard[];
  activeStoryId: string;
  activeStoryRecord: PlatformStoryRecord;
  isOpen: boolean;
  pendingDeleteStoryId: string | null;
  storybookError?: string;
  onCreateStory: () => void;
  onDeleteStory: (storyId: string) => void;
  onEditStory: (storyId: string) => void;
  onPendingDeleteStoryChange: (storyId: string | null) => void;
  onSelectStory: (storyId: string) => void;
  onTitleChange: (title: string) => void;
  onToggle: () => void;
};

export function StorybookMenu({
  activeOwnerStories,
  activeStoryId,
  activeStoryRecord,
  isOpen,
  pendingDeleteStoryId,
  storybookError = "",
  onCreateStory,
  onDeleteStory,
  onEditStory,
  onPendingDeleteStoryChange,
  onSelectStory,
  onTitleChange,
  onToggle
}: StorybookMenuProps) {
  return (
    <div className="relative">
      <button
        type="button"
        aria-expanded={isOpen}
        aria-label="Open storybook"
        title="Open storybook"
        onClick={onToggle}
        className="grid h-11 w-11 place-items-center rounded-lg text-slate-800 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800/70"
      >
        <BookOpen className="h-5 w-5" aria-hidden="true" />
      </button>
      {isOpen ? (
        <div
          role="dialog"
          aria-label="Storybook"
          className="absolute right-0 top-14 grid w-72 gap-3 rounded-lg border border-slate-200 bg-white/95 p-3 shadow-2xl backdrop-blur-xl dark:border-slate-700/70 dark:bg-slate-900/95"
        >
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase text-slate-600 dark:text-slate-400">
              Storybook
            </p>
            <button
              type="button"
              aria-label="New story"
              title="New story"
              onClick={onCreateStory}
              className="flex h-9 items-center justify-center gap-2 rounded-lg bg-slate-950 px-3 text-xs font-semibold text-white transition hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              New
            </button>
          </div>
          <label className="text-xs font-bold uppercase text-slate-600 dark:text-slate-400">
            Storyboard title
            <input
              aria-label="Storyboard title"
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold normal-case text-slate-950 outline-none transition focus:border-slate-300 focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-100 dark:focus:border-slate-600 dark:focus:ring-slate-700"
              value={activeStoryRecord.title}
              onChange={(event) => onTitleChange(event.target.value)}
            />
          </label>
          {storybookError ? (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 dark:border-rose-400/25 dark:bg-rose-500/10 dark:text-rose-300">
              {storybookError}
            </p>
          ) : null}
          <div className="grid gap-2">
            {activeOwnerStories.map((storyItem) => {
              const isActive = storyItem.storyId === activeStoryId;
              const isPendingDelete = storyItem.storyId === pendingDeleteStoryId;

              return (
                <div
                  key={storyItem.storyId}
                  className={`grid grid-cols-[minmax(0,1fr)_32px_32px] items-center gap-1 rounded-lg p-1 ring-1 transition ${
                    isActive
                      ? "bg-slate-950 text-white ring-slate-950 dark:bg-slate-100 dark:text-slate-950 dark:ring-slate-100"
                      : "bg-white text-slate-800 ring-slate-200 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700"
                  }`}
                >
                  <button
                    type="button"
                    aria-label={`Select ${storyItem.title}`}
                    onClick={() => onSelectStory(storyItem.storyId)}
                    className={`min-w-0 rounded-lg px-2 py-2 text-left text-sm font-semibold transition ${
                      isActive
                        ? "hover:bg-white/10 dark:hover:bg-slate-950/10"
                        : "hover:bg-slate-50 dark:hover:bg-slate-800"
                    }`}
                  >
                    <span className="block truncate">{storyItem.title}</span>
                  </button>
                  {isPendingDelete ? (
                    <>
                      <button
                        type="button"
                        aria-label={`Confirm delete ${storyItem.title}`}
                        title={`Confirm delete ${storyItem.title}`}
                        onClick={() => onDeleteStory(storyItem.storyId)}
                        className={`grid h-8 w-8 place-items-center rounded-lg transition ${
                          isActive
                            ? "text-emerald-100 hover:bg-white/10 dark:text-emerald-700 dark:hover:bg-slate-950/10"
                            : "text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-500/10"
                        }`}
                      >
                        <Check className="h-4 w-4" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Cancel delete ${storyItem.title}`}
                        title={`Cancel delete ${storyItem.title}`}
                        onClick={() => onPendingDeleteStoryChange(null)}
                        className={`grid h-8 w-8 place-items-center rounded-lg transition ${
                          isActive
                            ? "hover:bg-white/10 dark:hover:bg-slate-950/10"
                            : "hover:bg-slate-50 dark:hover:bg-slate-800"
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
                        onClick={() => onEditStory(storyItem.storyId)}
                        className={`grid h-8 w-8 place-items-center rounded-lg transition ${
                          isActive
                            ? "hover:bg-white/10 dark:hover:bg-slate-950/10"
                            : "hover:bg-slate-50 dark:hover:bg-slate-800"
                        }`}
                      >
                        <Edit3 className="h-4 w-4" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete ${storyItem.title}`}
                        title={`Delete ${storyItem.title}`}
                        onClick={() => onPendingDeleteStoryChange(storyItem.storyId)}
                        className={`grid h-8 w-8 place-items-center rounded-lg transition ${
                          isActive
                            ? "text-rose-100 hover:bg-white/10 dark:text-rose-700 dark:hover:bg-slate-950/10"
                            : "text-rose-700 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
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
  );
}
