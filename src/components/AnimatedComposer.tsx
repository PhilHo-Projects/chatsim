import { Avatar } from "./Avatar";

type AnimatedComposerProps = {
  draftText: string;
  povAvatarUrl?: string;
  povInitials: string;
  povName: string;
};

export function AnimatedComposer({
  draftText,
  povAvatarUrl,
  povInitials,
  povName
}: AnimatedComposerProps) {
  const hasDraft = draftText.length > 0;

  return (
    <div className="border-t border-white/50 bg-white/60 px-3 pb-4 pt-3 backdrop-blur-2xl">
      <div className="grid grid-cols-[44px_minmax(0,1fr)] items-end gap-2">
        <Avatar
          avatarUrl={povAvatarUrl}
          initials={povInitials}
          label={`${povName} avatar`}
        />

        <div
          aria-live="polite"
          className="min-h-10 rounded-[22px] border border-white/50 bg-white/50 px-4 py-2.5 text-[15px] leading-snug text-slate-950 shadow-inner backdrop-blur-xl"
        >
          {hasDraft ? (
            <span>
              {draftText}
              <span className="ml-0.5 inline-block h-4 w-px translate-y-0.5 animate-pulse bg-slate-500" />
            </span>
          ) : (
            <span className="text-slate-400">Type a message</span>
          )}
        </div>
      </div>
    </div>
  );
}
