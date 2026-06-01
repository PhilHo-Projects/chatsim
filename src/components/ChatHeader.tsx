import { ChevronLeft, MoreHorizontal, Phone, Video } from "lucide-react";
import { Avatar } from "./Avatar";

type ChatHeaderProps = {
  avatarUrl?: string;
  initials: string;
  name: string;
  onAvatarClick?: () => void;
  status: string;
};

export function ChatHeader({
  avatarUrl,
  initials,
  name,
  onAvatarClick,
  status
}: ChatHeaderProps) {
  return (
    <header className="grid h-20 grid-cols-[32px_minmax(0,1fr)_104px] items-center border-b border-white/50 bg-white/60 px-3 backdrop-blur-2xl">
      <button
        type="button"
        aria-label="Back"
        title="Back"
        className="grid h-9 w-8 place-items-center rounded-full text-[#1769d2] transition hover:bg-slate-100"
      >
        <ChevronLeft className="h-6 w-6" aria-hidden="true" />
      </button>

      <div className="flex min-w-0 items-center justify-start gap-2">
        <button
          type="button"
          aria-label={`Open ${name} avatar`}
          title={`Open ${name} avatar`}
          onClick={onAvatarClick}
          className="rounded-full transition hover:scale-105 focus:outline-none focus:ring-2 focus:ring-[#1769d2]/40"
        >
          <Avatar
            avatarUrl={avatarUrl}
            initials={initials}
            label={`${name} avatar`}
            status={status}
          />
        </button>
        <div className="min-w-0 text-left">
          <h1 className="truncate text-base font-semibold text-slate-950">
            {name}
          </h1>
        </div>
      </div>

      <div className="flex justify-end gap-0.5">
        <button
          type="button"
          aria-label="Call"
          title="Call"
          className="grid h-9 w-9 place-items-center rounded-full text-[#1769d2] transition hover:bg-slate-100"
        >
          <Phone className="h-[18px] w-[18px]" aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="Video call"
          title="Video call"
          className="grid h-9 w-9 place-items-center rounded-full text-[#1769d2] transition hover:bg-slate-100"
        >
          <Video className="h-[18px] w-[18px]" aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="More"
          title="More"
          className="grid h-9 w-9 place-items-center rounded-full text-slate-500 transition hover:bg-slate-100"
        >
          <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
