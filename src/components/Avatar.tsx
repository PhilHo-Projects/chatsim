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

// Generic "no avatar yet" mark: a head-and-shoulders silhouette with a "?" on
// the face. Used whenever a profile has no uploaded image so that empty
// profiles read as unknown instead of all reusing the same seeded portrait.
function EmptyAvatarGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-full w-full text-slate-500"
      aria-hidden="true"
    >
      <path
        d="M3.5 22c0-4.3 3.8-7.2 8.5-7.2s8.5 2.9 8.5 7.2"
        fill="currentColor"
      />
      <circle cx="12" cy="8.5" r="5.2" fill="currentColor" />
      <text
        x="12"
        y="11"
        textAnchor="middle"
        fontSize="7"
        fontWeight={700}
        fill="#f8fafc"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
      >
        ?
      </text>
    </svg>
  );
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
  const backgroundClass = avatarUrl ? "bg-[#f36d54]/95" : "bg-slate-200";

  return (
    <div
      aria-label={label}
      className={`${sizeClasses} ${ringClass} ${backgroundClass} grid shrink-0 place-items-center overflow-hidden rounded-full text-white shadow-sm ring-2`}
    >
      {avatarUrl ? (
        <img
          alt=""
          className="h-full w-full object-cover"
          draggable={false}
          src={avatarUrl}
        />
      ) : (
        <EmptyAvatarGlyph />
      )}
      <span className="sr-only">{initials}</span>
    </div>
  );
}
