import philBattlePixelCover from "../assets/story-card-backgrounds/story-covers/phil-battle-pixel.webp";
import philKetaminePrisonCover from "../assets/story-card-backgrounds/story-covers/phil-ketamine-prison.webp";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Search } from "lucide-react";
import { buildProfileArt } from "../utils/profileArt";
import type { PlatformProfile } from "../data/platformSeed";

type LandingPageProps = {
  onSearchQueryChange: (value: string) => void;
  onSelectProfile: (profileId: string) => void;
  onSelectStory: (storyId: string) => void;
  profiles: PlatformProfile[];
  searchQuery: string;
  selectedProfileId: string | null;
};

/** How long a featured card holds the centre before the deck advances. */
const AUTOPLAY_INTERVAL_MS = 5000;

/** Cards further than this from the centre are not painted at all. */
const MAX_VISIBLE_OFFSET = 2;

/**
 * The deck is a highlight reel, not the directory. Capping it keeps the dot
 * row readable and stops the stage from mounting a card per profile once the
 * platform has more than a handful.
 */
const MAX_FEATURED_PROFILES = 7;

const STORY_COVERS: Record<string, { image: string; objectPosition: string }> = {
  "story-phil-1": {
    image: philKetaminePrisonCover,
    objectPosition: "50% 48%"
  },
  "story-phil-battle": {
    image: philBattlePixelCover,
    objectPosition: "50% 50%"
  }
};

function sceneCountLabel(count: number) {
  return `${count} ${count === 1 ? "scene" : "scenes"}`;
}

function storyCountLabel(count: number) {
  return `${count} ${count === 1 ? "story" : "stories"}`;
}

function ProfileArtwork({
  compact = false,
  handle
}: {
  compact?: boolean;
  handle: string;
}) {
  const art = buildProfileArt(handle, { compact });

  return (
    <svg
      aria-hidden="true"
      className="h-full w-full"
      preserveAspectRatio="xMidYMid slice"
      viewBox={art.viewBox}
    >
      <rect fill="#08070b" height="400" width="300" x="0" y="0" />
      <g filter={`url(#profile-soft-${compact ? "c" : "f"})`} opacity="0.8">
        {art.strokes.map((stroke, index) => (
          <path
            key={`glow-${index}`}
            d={stroke.d}
            fill="none"
            opacity={stroke.opacity}
            stroke={stroke.color}
            strokeLinecap="round"
            strokeWidth={stroke.width}
          />
        ))}
      </g>
      {art.strokes.map((stroke, index) => (
        <path
          key={`core-${index}`}
          d={stroke.d}
          fill="none"
          opacity={stroke.opacity}
          stroke={stroke.color}
          strokeLinecap="round"
          strokeWidth={stroke.width}
        />
      ))}
      {art.nodes.map((node, index) => (
        <circle
          key={`node-${index}`}
          cx={node.cx}
          cy={node.cy}
          fill={node.color}
          r={node.r}
        />
      ))}
      <defs>
        <filter id={`profile-soft-${compact ? "c" : "f"}`}>
          <feGaussianBlur stdDeviation={compact ? 5 : 7} />
        </filter>
      </defs>
    </svg>
  );
}

function normalizeSearchQuery(value: string) {
  return value.trim().toLowerCase();
}

function matchesProfileSearch(profile: PlatformProfile, query: string) {
  const handleQuery = query.replace(/^@+/, "");

  return (
    profile.username.toLowerCase().includes(handleQuery) ||
    (profile.bio ?? "").toLowerCase().includes(query)
  );
}

function filterProfilesForSearch(
  profiles: PlatformProfile[],
  searchQuery: string
) {
  const query = normalizeSearchQuery(searchQuery);

  if (!query) {
    return profiles;
  }

  return profiles.filter((profile) => matchesProfileSearch(profile, query));
}

/**
 * Shortest signed distance from the active card on a looping deck, so index 0
 * sits one step to the right of the last card instead of rewinding the stack.
 */
function getDeckOffset(index: number, activeIndex: number, total: number) {
  const half = Math.floor(total / 2);
  const forward = (((index - activeIndex) % total) + total) % total;

  return forward > half ? forward - total : forward;
}

function getDeckCardStyle(offset: number): CSSProperties {
  const distance = Math.abs(offset);

  if (distance > MAX_VISIBLE_OFFSET) {
    return {
      opacity: 0,
      pointerEvents: "none",
      transform: "translate(-50%, 0) scale(0.6)",
      zIndex: 0
    };
  }

  const slide = offset * 56;
  const scale = distance === 0 ? 1 : distance === 1 ? 0.84 : 0.7;
  const tilt = offset === 0 ? 0 : offset > 0 ? -18 : 18;
  const blur = distance === 0 ? 0 : distance === 1 ? 2.5 : 5;
  const fade = distance === 0 ? 1 : distance === 1 ? 0.72 : 0.38;

  return {
    filter: distance === 0 ? undefined : `blur(${blur}px)`,
    opacity: fade,
    transform:
      `translate(-50%, 0) translateX(${slide}%) ` +
      `scale(${scale}) rotateY(${tilt}deg)`,
    zIndex: 10 - distance
  };
}

function usePrefersReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") {
      return;
    }

    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setPrefersReducedMotion(query.matches);

    sync();
    query.addEventListener("change", sync);

    return () => query.removeEventListener("change", sync);
  }, []);

  return prefersReducedMotion;
}

type FeaturedDeckProps = {
  onSelectProfile: (profileId: string) => void;
  profiles: PlatformProfile[];
};

function FeaturedDeck({ onSelectProfile, profiles }: FeaturedDeckProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const prefersReducedMotion = usePrefersReducedMotion();
  const total = profiles.length;
  const stageRef = useRef<HTMLDivElement>(null);

  const step = useCallback(
    (direction: number) => {
      setActiveIndex((current) => (current + direction + total) % total);
    },
    [total]
  );

  useEffect(() => {
    if (isPaused || prefersReducedMotion || total < 2) {
      return;
    }

    const timer = window.setInterval(
      () => step(1),
      AUTOPLAY_INTERVAL_MS
    );

    return () => window.clearInterval(timer);
  }, [isPaused, prefersReducedMotion, step, total]);

  // Keep the active card in range when the featured set shrinks.
  useEffect(() => {
    setActiveIndex((current) => (current < total ? current : 0));
  }, [total]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      step(-1);
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      step(1);
    }
  };

  return (
    <div
      aria-label="Featured profiles"
      aria-roledescription="carousel"
      role="group"
      className="relative w-full select-none"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) {
          setIsPaused(false);
        }
      }}
      onFocus={() => setIsPaused(true)}
      onKeyDown={handleKeyDown}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div
        ref={stageRef}
        className="relative h-80 w-full sm:h-96"
        style={{ perspective: "1200px" }}
      >
        {profiles.map((profile, index) => {
          const offset = getDeckOffset(index, activeIndex, total);
          const distance = Math.abs(offset);
          const isActive = offset === 0;
          const isHidden = distance > MAX_VISIBLE_OFFSET;
          const label = storyCountLabel(profile.stories.length);

          return (
            <button
              key={profile.id}
              type="button"
              aria-hidden={isHidden || undefined}
              aria-label={`Open @${profile.username}, ${label}`}
              tabIndex={isHidden ? -1 : 0}
              onClick={() => {
                if (isActive) {
                  onSelectProfile(profile.id);
                  return;
                }

                setActiveIndex(index);
              }}
              className="absolute left-1/2 top-0 h-full overflow-hidden rounded-2xl text-left text-white shadow-[0_24px_60px_rgba(15,23,42,0.28)] ring-1 ring-white/12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950"
              style={{
                ...getDeckCardStyle(offset),
                // Sized here rather than with a breakpoint class so the deck
                // scales smoothly with the viewport instead of jumping at 640px.
                width: "min(18rem, 62vw)",
                // Only the properties the deck actually animates. `transition-all`
                // would also animate width on every viewport change and filter on
                // every step, which is expensive across five blurred cards.
                transition: prefersReducedMotion
                  ? "none"
                  : "transform 500ms ease-out, opacity 500ms ease-out, filter 500ms ease-out"
              }}
            >
              <span
                aria-hidden="true"
                data-testid={`profile-card-background-${profile.id}`}
                className="absolute inset-0"
              >
                <ProfileArtwork handle={profile.username} />
              </span>
              <span
                aria-hidden="true"
                className="absolute inset-0 bg-[linear-gradient(180deg,rgba(2,6,23,0.10)_0%,rgba(2,6,23,0.04)_42%,rgba(2,6,23,0.62)_100%)]"
              />
              <span className="relative z-10 grid h-full content-end gap-1.5 p-5">
                <span className="block truncate font-round text-2xl font-bold leading-tight text-[color:var(--text)]">
                  @{profile.username}
                </span>
                {profile.bio ? (
                  <span className="line-clamp-2 text-sm text-[color:var(--muted)]">
                    {profile.bio}
                  </span>
                ) : null}
                <span className="mt-1 w-fit rounded-full border border-[color:var(--neon-1)] px-2 py-0.5 text-[0.65rem] font-black uppercase tracking-[0.12em] text-[color:var(--neon-1)]">
                  {label}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {total > 1 ? (
        <>
          <button
            type="button"
            aria-label="Previous featured profile"
            onClick={() => step(-1)}
            className="absolute left-1 top-1/2 z-20 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-slate-900/85 text-lg font-black text-slate-50 shadow-[0_8px_24px_rgba(15,23,42,0.22)] ring-1 ring-white/15 transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 sm:left-4"
          >
            &#8249;
          </button>
          <button
            type="button"
            aria-label="Next featured profile"
            onClick={() => step(1)}
            className="absolute right-1 top-1/2 z-20 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-slate-900/85 text-lg font-black text-slate-50 shadow-[0_8px_24px_rgba(15,23,42,0.22)] ring-1 ring-white/15 transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 sm:right-4"
          >
            &#8250;
          </button>

          <div className="mt-4 flex items-center justify-center gap-2">
            {profiles.map((profile, index) => (
              <button
                key={profile.id}
                type="button"
                aria-current={index === activeIndex || undefined}
                aria-label={`Feature @${profile.username}`}
                onClick={() => setActiveIndex(index)}
                className={
                  "h-1.5 rounded-full transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 " +
                  (index === activeIndex
                    ? "w-6 bg-slate-100"
                    : "w-1.5 bg-slate-100/25 hover:bg-slate-100/45")
                }
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

export function LandingPage({
  onSearchQueryChange,
  onSelectProfile,
  onSelectStory,
  profiles,
  searchQuery,
  selectedProfileId
}: LandingPageProps) {
  const selectedProfile =
    profiles.find((profile) => profile.id === selectedProfileId) ?? null;
  const visibleProfiles = filterProfilesForSearch(profiles, searchQuery);
  const isSearching = normalizeSearchQuery(searchQuery).length > 0;

  if (selectedProfile) {
    return (
      <section className="mx-auto grid w-full max-w-6xl gap-5">
        <div className="text-center">
          <h2 className="font-round text-4xl font-semibold tracking-tight text-slate-50 sm:text-5xl">
            @{selectedProfile.username}
          </h2>
          {selectedProfile.bio ? (
            <p className="mt-1.5 text-sm text-slate-500">
              {selectedProfile.bio}
            </p>
          ) : null}
        </div>

        <div
          aria-label="Story bento grid"
          className="w-full columns-1 gap-4 overflow-y-auto pb-24 sm:columns-2 lg:columns-3"
        >
          {selectedProfile.stories.map((story, index) => {
            const label = sceneCountLabel(story.sceneCount);
            const storyCover = STORY_COVERS[story.storyId];
            const heightClass =
              index % 3 === 0 ? "h-72" : index % 3 === 1 ? "h-64" : "h-80";

            return (
              <button
                key={story.storyId}
                type="button"
                aria-label={`Open ${story.title} ${label}`}
                onClick={() => onSelectStory(story.storyId)}
                className={`group relative mb-4 grid w-full break-inside-avoid overflow-hidden rounded-lg text-left text-white shadow-[0_16px_40px_rgba(15,23,42,0.18)] ring-1 ring-white/12 transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_22px_54px_rgba(15,23,42,0.22)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 ${heightClass}`}
              >
                <span
                  aria-hidden="true"
                  data-testid={`story-card-background-${story.storyId}`}
                  className="absolute inset-0"
                >
                  {storyCover ? (
                    <img
                      alt=""
                      decoding="async"
                      draggable={false}
                      loading="eager"
                      src={storyCover.image}
                      className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                      style={{ objectPosition: storyCover.objectPosition }}
                    />
                  ) : (
                    <span
                      className="block h-full w-full"
                      style={{ background: story.coverColor }}
                    />
                  )}
                </span>
                <span
                  aria-hidden="true"
                  className="absolute inset-0 bg-[linear-gradient(180deg,rgba(2,6,23,0.08)_0%,rgba(2,6,23,0.03)_45%,rgba(2,6,23,0.52)_100%)]"
                />
                <span className="relative z-10 grid h-full content-end gap-2 p-4">
                  <span className="block font-round text-2xl font-bold leading-tight text-white drop-shadow-[0_2px_10px_rgba(2,6,23,0.55)]">
                    {story.title}
                  </span>
                  <span className="w-fit rounded-lg bg-white/90 px-2.5 py-1 text-xs font-black uppercase text-slate-950">
                    {label}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto grid w-full max-w-5xl gap-8 pb-24">
      <div className="text-center">
        <h2 className="font-round text-5xl font-semibold tracking-tight text-slate-50 sm:text-6xl">
          chatsim
        </h2>
      </div>

      {!isSearching && visibleProfiles.length > 0 ? (
        <FeaturedDeck
          onSelectProfile={onSelectProfile}
          profiles={visibleProfiles.slice(0, MAX_FEATURED_PROFILES)}
        />
      ) : null}

      <label className="app-glass mx-auto flex h-12 w-full max-w-md items-center gap-3 rounded-xl px-4 text-[color:var(--muted)]">
        <span className="sr-only">Search profiles</span>
        <Search aria-hidden="true" className="h-5 w-5 shrink-0" />
        <input
          aria-label="Search profiles"
          className="h-full min-w-0 flex-1 bg-transparent text-base font-semibold text-[color:var(--text)] outline-none placeholder:text-[color:var(--muted)]"
          onChange={(event) => onSearchQueryChange(event.target.value)}
          placeholder="Search profiles"
          type="search"
          value={searchQuery}
        />
      </label>

      <div aria-label="All profiles" className="app-glass w-full rounded-2xl px-4">
        <ul className="grid divide-y divide-[color:var(--line)]">
          {visibleProfiles.map((profile) => (
            <li key={profile.id}>
              <button
                type="button"
                aria-label={`Open @${profile.username}, ${storyCountLabel(profile.stories.length)}`}
                onClick={() => onSelectProfile(profile.id)}
                className="group flex w-full items-center gap-3 py-3 text-left transition hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--neon-1)]"
              >
                <span className="h-9 w-9 shrink-0 overflow-hidden rounded-lg border border-[color:var(--line)]">
                  <ProfileArtwork compact handle={profile.username} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-round text-base font-bold text-[color:var(--text)] group-hover:underline">
                    @{profile.username}
                  </span>
                  {profile.bio ? (
                    <span className="block truncate text-sm text-[color:var(--muted)]">
                      {profile.bio}
                    </span>
                  ) : null}
                </span>
                <span className="ml-auto shrink-0 text-xs font-bold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                  {storyCountLabel(profile.stories.length)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
