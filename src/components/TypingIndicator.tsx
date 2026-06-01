import { Avatar } from "./Avatar";

type TypingIndicatorProps = {
  contactAvatarUrl?: string;
  contactInitials: string;
  contactName: string;
  contactStatus?: string;
};

export function TypingIndicator({
  contactAvatarUrl,
  contactInitials,
  contactName,
  contactStatus
}: TypingIndicatorProps) {
  return (
    <div className="flex items-end gap-2" aria-live="polite">
      <Avatar
        avatarUrl={contactAvatarUrl}
        initials={contactInitials}
        label={`${contactName} avatar`}
        size="sm"
        status={contactStatus}
      />
      <div className="rounded-[22px] rounded-bl-md bg-white/70 px-4 py-2.5 text-sm text-slate-600 shadow-bubble ring-1 ring-white/70 backdrop-blur-xl">
        <span className="mr-2">{contactName} is typing</span>
        <span className="inline-flex translate-y-0.5 gap-1" aria-hidden="true">
          <span className="h-1.5 w-1.5 animate-[typing-dot_1s_ease-in-out_infinite] rounded-full bg-slate-400" />
          <span className="h-1.5 w-1.5 animate-[typing-dot_1s_ease-in-out_150ms_infinite] rounded-full bg-slate-400" />
          <span className="h-1.5 w-1.5 animate-[typing-dot_1s_ease-in-out_300ms_infinite] rounded-full bg-slate-400" />
        </span>
      </div>
    </div>
  );
}
