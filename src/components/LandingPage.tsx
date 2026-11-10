import philBattlePixelCover from "../assets/story-card-backgrounds/story-covers/phil-battle-pixel.webp";
import philKetaminePrisonCover from "../assets/story-card-backgrounds/story-covers/phil-ketamine-prison.webp";
import { Play, Search } from "lucide-react";
import { ProfileAvatar } from "../profile-avatars/ProfileAvatar";
import { getProfileAvatarPresetId } from "../profile-avatars/profileAvatarPresets";
import { buildProfileArt } from "../utils/profileArt";
import type { PlatformProfile, PlatformStoryCard } from "../data/platformSeed";
import { formatAppRoute } from "../navigation/appRoute";

type LandingPageProps = {
  onSearchQueryChange: (value: string) => void;
  onSelectProfile: (profileId: string) => void;
  onSelectStory: (storyId: string) => void;
  profiles: PlatformProfile[];
  searchQuery: string;
  selectedProfileId: string | null;
};

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

function getStoryCover(story: PlatformStoryCard) {
  const uploadedCover = story.coverImage?.variants.card;
  return uploadedCover
    ? { image: uploadedCover, objectPosition: "50% 50%" }
    : STORY_COVERS[story.storyId];
}

function sceneCountLabel(count: number) {
  return `${count} ${count === 1 ? "scene" : "scenes"}`;
}

function storyCountLabel(count: number) {
  return `${count} ${count === 1 ? "story" : "stories"}`;
}

function StoryFallbackArtwork({ handle }: { handle: string }) {
  const art = buildProfileArt(handle);

  return (
    <svg
      aria-hidden="true"
      className="h-full w-full"
      preserveAspectRatio="xMidYMid slice"
      viewBox={art.viewBox}
    >
      <rect fill="#08070b" height="400" width="300" x="0" y="0" />
      <g className="profile-art__depth">
        {art.strokes.map((stroke, index) => (
          <path
            key={`depth-${index}`}
            d={stroke.d}
            fill="none"
            opacity={stroke.opacity * 0.18}
            stroke={stroke.color}
            strokeLinecap="round"
            strokeWidth={stroke.width * 2.4}
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
            <p className="mt-1.5 text-sm text-[color:var(--muted)]">
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
            const storyCover = getStoryCover(story);
            const heightClass =
              index % 3 === 0 ? "h-80" : index % 3 === 1 ? "h-64" : "h-72";

            return (
              <button
                key={story.storyId}
                type="button"
                aria-label={`Open ${story.title} ${label}`}
                onClick={() => onSelectStory(story.storyId)}
                className={`group relative mb-4 grid w-full break-inside-avoid overflow-hidden rounded-lg text-left text-white shadow-[0_16px_40px_rgba(15,23,42,0.18)] ring-1 ring-white/12 transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_22px_54px_rgba(15,23,42,0.22)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--neon-1)] ${heightClass}`}
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
                    <StoryFallbackArtwork handle={story.storyId} />
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
                  <span className="w-fit rounded-full border border-[color:var(--neon-1)] px-2.5 py-1 text-xs font-black uppercase tracking-[0.12em] text-[color:var(--neon-1)]">
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

  const stories = profiles.flatMap((profile) => profile.stories);
  const featuredStories = Object.keys(STORY_COVERS).flatMap((id) => {
    const story = stories.find((card) => card.storyId === id);
    return story ? [story] : [];
  });

  return (
    <section className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-7 pb-10 md:gap-9">
      <div className="text-center">
        <h1 className="font-round text-4xl font-semibold tracking-tight text-slate-50 sm:text-5xl">
          chatsim
        </h1>
      </div>

      {!isSearching && featuredStories.length > 0 ? (
        <section aria-labelledby="featured-stories-heading" className="grid gap-3">
          <h2 id="featured-stories-heading" className="text-sm font-semibold text-[color:var(--text)]">
            Featured stories
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
            {featuredStories.map((story) => {
              const cover = getStoryCover(story);
              const format = story.presentationMode === "battle" ? "Pixel battle" : "Text conversation";

              return (
                <a
                  key={story.storyId}
                  href={formatAppRoute({ name: "story", storyId: story.storyId })}
                  onClick={(event) => {
                    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
                      return;
                    }
                    event.preventDefault();
                    onSelectStory(story.storyId);
                  }}
                  className="group grid min-w-0 overflow-hidden rounded-xl border border-white/15 bg-[#131018] transition-colors hover:border-white/45 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[color:var(--neon-1)]"
                >
                  <div className="aspect-[2.6/1] overflow-hidden sm:aspect-video">
                    <img
                      alt=""
                      className="h-full w-full object-cover transition-transform duration-300 motion-safe:group-hover:scale-[1.03]"
                      decoding="async"
                      src={cover.image}
                      style={{ objectPosition: cover.objectPosition }}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-3 border-t border-white/10 px-4 py-3">
                    <div className="min-w-0">
                      <h3 className="font-round text-xl font-semibold leading-tight text-white sm:text-2xl">
                        {story.title}
                      </h3>
                      <p className="mt-1 text-sm text-[color:var(--muted)]">
                        {format} · {sceneCountLabel(story.sceneCount)}
                      </p>
                    </div>
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/20 text-[color:var(--text)] transition-colors group-hover:bg-white group-hover:text-slate-950">
                      <Play aria-hidden="true" className="h-4 w-4 fill-current" />
                    </span>
                  </div>
                </a>
              );
            })}
          </div>
        </section>
      ) : null}

      <section aria-labelledby="profile-directory-heading" className="grid gap-3">
        <h2 id="profile-directory-heading" className="text-sm font-semibold text-[color:var(--text)]">
          Profiles
        </h2>
        <label className="app-glass flex h-12 w-full items-center gap-3 rounded-xl px-4 text-[color:var(--muted)] focus-within:ring-2 focus-within:ring-[color:var(--neon-1)]">
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
          <ul className="grid min-w-0 grid-cols-1 divide-y divide-[color:var(--line)]">
            {visibleProfiles.map((profile) => (
              <li key={profile.id}>
                <button
                  type="button"
                  aria-label={`Open @${profile.username}, ${storyCountLabel(profile.stories.length)}`}
                  onClick={() => onSelectProfile(profile.id)}
                  className="group flex w-full items-center gap-3 py-3 text-left transition hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--neon-1)]"
                >
                  <span className="h-9 w-9 shrink-0 overflow-hidden rounded-lg border border-[color:var(--line)]">
                    <ProfileAvatar
                      compact
                      presetId={getProfileAvatarPresetId(profile.id)}
                    />
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
    </section>
  );
}
