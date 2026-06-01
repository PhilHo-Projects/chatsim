import motelLobbyCover from "../assets/story-card-backgrounds/motel-lobby.png";
import neonSleepoverCover from "../assets/story-card-backgrounds/neon-sleepover.png";
import orbitThreadsCover from "../assets/story-card-backgrounds/orbit-threads.png";
import philStoriesCover from "../assets/story-card-backgrounds/phil-stories.png";
import voidPopCover from "../assets/story-card-backgrounds/void-pop.png";
import type { PlatformProfile } from "../data/platformSeed";

type LandingPageProps = {
  onSelectProfile: (profileId: string) => void;
  onSelectStory: (storyId: string) => void;
  profiles: PlatformProfile[];
  selectedProfileId: string | null;
};

type ProfileCover = {
  accentColor: string;
  image: string;
  objectPosition: string;
  profileClassName: string;
  storyClassName: string;
};

const DEFAULT_PROFILE_CARD_CLASS = "h-52 sm:h-60";
const DEFAULT_STORY_CARD_CLASS = "h-64";

const PROFILE_COVERS: Record<string, ProfileCover> = {
  "user-phil": {
    accentColor: "#e11d48",
    image: philStoriesCover,
    objectPosition: "50% 52%",
    profileClassName: "h-[22rem] sm:h-[28rem]",
    storyClassName: "h-[24rem]"
  },
  "user-neon": {
    accentColor: "#0891b2",
    image: neonSleepoverCover,
    objectPosition: "50% 48%",
    profileClassName: "h-64 sm:h-72",
    storyClassName: "h-72"
  },
  "user-orbit": {
    accentColor: "#65a30d",
    image: orbitThreadsCover,
    objectPosition: "56% 50%",
    profileClassName: "h-56 sm:h-64",
    storyClassName: "h-64"
  },
  "user-motel": {
    accentColor: "#d97706",
    image: motelLobbyCover,
    objectPosition: "54% 58%",
    profileClassName: "h-72 sm:h-80",
    storyClassName: "h-80"
  },
  "user-void": {
    accentColor: "#7c3aed",
    image: voidPopCover,
    objectPosition: "48% 50%",
    profileClassName: "h-60 sm:h-72",
    storyClassName: "h-72"
  }
};

function getProfileCover(profile: PlatformProfile) {
  return PROFILE_COVERS[profile.id] ?? {
    accentColor: profile.accentColor,
    image: "",
    objectPosition: "50% 50%",
    profileClassName: DEFAULT_PROFILE_CARD_CLASS,
    storyClassName: DEFAULT_STORY_CARD_CLASS
  };
}

function sceneCountLabel(count: number) {
  return `${count} ${count === 1 ? "scene" : "scenes"}`;
}

function storyCountLabel(count: number) {
  return `${count} ${count === 1 ? "story" : "stories"}`;
}

export function LandingPage({
  onSelectProfile,
  onSelectStory,
  profiles,
  selectedProfileId
}: LandingPageProps) {
  const selectedProfile =
    profiles.find((profile) => profile.id === selectedProfileId) ?? null;

  if (selectedProfile) {
    const selectedCover = getProfileCover(selectedProfile);

    return (
      <section className="mx-auto grid w-full max-w-6xl gap-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-4xl font-black leading-none text-slate-950 sm:text-5xl">
              {selectedProfile.displayName}
            </h2>
            <p className="mt-2 text-sm font-semibold text-slate-500">
              @{selectedProfile.username} / {storyCountLabel(selectedProfile.stories.length)}
            </p>
          </div>
        </div>

        <div
          aria-label="Story bento grid"
          className="w-full columns-1 gap-4 overflow-y-auto pb-24 sm:columns-2 lg:columns-3"
        >
          {selectedProfile.stories.map((story, index) => {
            const label = sceneCountLabel(story.sceneCount);
            const heightClass =
              index % 3 === 0
                ? selectedCover.storyClassName
                : index % 3 === 1
                  ? "h-64"
                  : "h-80";

            return (
              <button
                key={story.storyId}
                type="button"
                aria-label={`Open ${story.title} ${label}`}
                onClick={() => onSelectStory(story.storyId)}
                className={`group relative mb-4 grid w-full break-inside-avoid overflow-hidden rounded-lg bg-slate-950 text-left text-white shadow-[0_16px_40px_rgba(15,23,42,0.18)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_22px_54px_rgba(15,23,42,0.22)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 ${heightClass}`}
              >
                <span
                  aria-hidden="true"
                  data-testid={`story-card-background-${story.storyId}`}
                  className="absolute inset-0"
                >
                  {selectedCover.image ? (
                    <img
                      alt=""
                      draggable={false}
                      src={selectedCover.image}
                      className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                      style={{ objectPosition: selectedCover.objectPosition }}
                    />
                  ) : (
                    <span
                      className="block h-full w-full"
                      style={{
                        background: `linear-gradient(135deg, ${story.coverColor}, rgba(15, 23, 42, 0.8))`
                      }}
                    />
                  )}
                </span>
                <span
                  aria-hidden="true"
                  className="absolute inset-0 bg-[linear-gradient(180deg,rgba(2,6,23,0.08)_0%,rgba(2,6,23,0.03)_45%,rgba(2,6,23,0.52)_100%)]"
                />
                <span className="relative z-10 grid h-full content-end gap-2 p-4">
                  <span className="block text-2xl font-black leading-tight text-white drop-shadow-[0_2px_10px_rgba(2,6,23,0.55)]">
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
    <section className="mx-auto grid w-full max-w-7xl gap-5">
      <div>
        <h2 className="text-4xl font-black leading-none text-slate-950 sm:text-5xl">
          chatsim
        </h2>
        <p className="mt-2 text-sm font-semibold text-slate-500">
          Browse public story profiles
        </p>
      </div>

      <div
        aria-label="Profile masonry"
        className="w-full columns-2 gap-4 overflow-y-auto pb-24 sm:columns-3 lg:columns-5"
      >
        {profiles.map((profile) => {
          const profileCover = getProfileCover(profile);
          const label = storyCountLabel(profile.stories.length);

          return (
            <button
              key={profile.id}
              type="button"
              aria-label={`Open ${profile.displayName}, ${label}`}
              onClick={() => onSelectProfile(profile.id)}
              className={`group relative mb-4 grid w-full break-inside-avoid overflow-hidden rounded-lg bg-slate-950 text-left text-white shadow-[0_16px_40px_rgba(15,23,42,0.16)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_22px_54px_rgba(15,23,42,0.2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 ${profileCover.profileClassName}`}
            >
              <span
                aria-hidden="true"
                data-testid={`profile-card-background-${profile.id}`}
                className="absolute inset-0"
              >
                {profileCover.image ? (
                  <img
                    alt=""
                    draggable={false}
                    src={profileCover.image}
                    className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                    style={{ objectPosition: profileCover.objectPosition }}
                  />
                ) : (
                  <span
                    className="block h-full w-full"
                    style={{
                      background: `linear-gradient(135deg, ${profileCover.accentColor}, rgba(15, 23, 42, 0.8))`
                    }}
                  />
                )}
              </span>
              <span
                aria-hidden="true"
                className="absolute inset-0 bg-[linear-gradient(180deg,rgba(2,6,23,0.16)_0%,rgba(2,6,23,0.06)_42%,rgba(2,6,23,0.52)_100%)]"
              />
              <span
                aria-hidden="true"
                className="absolute inset-x-0 top-0 z-10 h-1"
                style={{ backgroundColor: profileCover.accentColor }}
              />
              <span className="relative z-10 grid h-full content-between gap-3 p-3.5">
                <span className="min-w-0">
                  <span className="block truncate text-lg font-black text-white drop-shadow-[0_2px_10px_rgba(2,6,23,0.5)]">
                    {profile.displayName}
                  </span>
                  <span className="mt-1 block text-xs font-bold text-white/75 drop-shadow-[0_1px_6px_rgba(2,6,23,0.45)]">
                    @{profile.username}
                  </span>
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
