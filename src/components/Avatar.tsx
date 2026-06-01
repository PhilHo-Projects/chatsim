import { CircleUserRound } from "lucide-react";

type AvatarProps = {
  avatarUrl?: string;
  initials: string;
  label: string;
  size?: "sm" | "md";
  status?: string;
};

function getStatusRingClass(status?: string): string {
  switch (status) {
    case "busy":
      return "ring-rose-400/80";
    case "away":
      return "ring-amber-400/80";
    case "online now":
      return "ring-emerald-400/80";
    default:
      return "ring-white/80";
  }
}

export function Avatar({
  avatarUrl,
  initials,
  label,
  size = "md",
  status
}: AvatarProps) {
  const sizeClasses = size === "sm" ? "h-8 w-8" : "h-11 w-11";
  const ringClass = getStatusRingClass(status);

  return (
    <div
      aria-label={label}
      className={`${sizeClasses} ${ringClass} grid shrink-0 place-items-center overflow-hidden rounded-full bg-[#f36d54]/95 text-white shadow-sm ring-2`}
    >
      {avatarUrl ? (
        <img
          alt=""
          className="h-full w-full object-cover"
          draggable={false}
          src={avatarUrl}
        />
      ) : (
        <CircleUserRound className="h-5 w-5" aria-hidden="true" />
      )}
      <span className="sr-only">{initials}</span>
    </div>
  );
}
