import motelLobbyCover from "../assets/story-card-backgrounds/motel-lobby.png";
import neonSleepoverCover from "../assets/story-card-backgrounds/neon-sleepover.png";
import orbitThreadsCover from "../assets/story-card-backgrounds/orbit-threads.png";
import dummyProfile01Cover from "../assets/story-card-backgrounds/placeholders/dummy-profile-01.svg";
import dummyProfile02Cover from "../assets/story-card-backgrounds/placeholders/dummy-profile-02.svg";
import dummyProfile03Cover from "../assets/story-card-backgrounds/placeholders/dummy-profile-03.svg";
import dummyProfile04Cover from "../assets/story-card-backgrounds/placeholders/dummy-profile-04.svg";
import dummyProfile05Cover from "../assets/story-card-backgrounds/placeholders/dummy-profile-05.svg";
import dummyProfile06Cover from "../assets/story-card-backgrounds/placeholders/dummy-profile-06.svg";
import dummyProfile07Cover from "../assets/story-card-backgrounds/placeholders/dummy-profile-07.svg";
import dummyProfile08Cover from "../assets/story-card-backgrounds/placeholders/dummy-profile-08.svg";
import dummyProfile09Cover from "../assets/story-card-backgrounds/placeholders/dummy-profile-09.svg";
import dummyProfile10Cover from "../assets/story-card-backgrounds/placeholders/dummy-profile-10.svg";
import dummyProfile11Cover from "../assets/story-card-backgrounds/placeholders/dummy-profile-11.svg";
import dummyProfile12Cover from "../assets/story-card-backgrounds/placeholders/dummy-profile-12.svg";
import dummyProfile13Cover from "../assets/story-card-backgrounds/placeholders/dummy-profile-13.svg";
import dummyProfile14Cover from "../assets/story-card-backgrounds/placeholders/dummy-profile-14.svg";
import dummyProfile15Cover from "../assets/story-card-backgrounds/placeholders/dummy-profile-15.svg";
import dummyProfile16Cover from "../assets/story-card-backgrounds/placeholders/dummy-profile-16.svg";
import dummyProfile17Cover from "../assets/story-card-backgrounds/placeholders/dummy-profile-17.svg";
import dummyProfile18Cover from "../assets/story-card-backgrounds/placeholders/dummy-profile-18.svg";
import dummyProfile19Cover from "../assets/story-card-backgrounds/placeholders/dummy-profile-19.svg";
import dummyProfile20Cover from "../assets/story-card-backgrounds/placeholders/dummy-profile-20.svg";
import philStoriesCover from "../assets/story-card-backgrounds/phil-stories.png";
import dummyProfile01AnimeCover from "../assets/story-card-backgrounds/user-themes/demo-01-anime.webp";
import dummyProfile02CyberpunkCover from "../assets/story-card-backgrounds/user-themes/demo-02-cyberpunk.webp";
import dummyProfile03AbstractArtCover from "../assets/story-card-backgrounds/user-themes/demo-03-abstract-art.webp";
import dummyProfile04VegetationCover from "../assets/story-card-backgrounds/user-themes/demo-04-vegetation.webp";
import dummyProfile05BrutalistDecorCover from "../assets/story-card-backgrounds/user-themes/demo-05-brutalist-decor.webp";
import dummyProfile06SpaceStuffCover from "../assets/story-card-backgrounds/user-themes/demo-06-space-stuff.webp";
import dummyProfile07CuteStuffCover from "../assets/story-card-backgrounds/user-themes/demo-07-cute-stuff.webp";
import dummyProfile08GamingCover from "../assets/story-card-backgrounds/user-themes/demo-08-gaming.webp";
import dummyProfile09HandDrawnArtCover from "../assets/story-card-backgrounds/user-themes/demo-09-hand-drawn-art.webp";
import dummyProfile10StencilArtCover from "../assets/story-card-backgrounds/user-themes/demo-10-stencil-art.webp";
import dummyProfile11FoodCover from "../assets/story-card-backgrounds/user-themes/demo-11-food.webp";
import dummyProfile12AnimalsNatureCover from "../assets/story-card-backgrounds/user-themes/demo-12-animals-nature.webp";
import dummyProfile13CosplayCover from "../assets/story-card-backgrounds/user-themes/demo-13-cosplay.webp";
import dummyProfile14ComputerGeekCover from "../assets/story-card-backgrounds/user-themes/demo-14-computer-geek.webp";
import dummyProfile15PastelCraftsCover from "../assets/story-card-backgrounds/user-themes/demo-15-pastel-crafts.webp";
import dummyProfile16AliensCover from "../assets/story-card-backgrounds/user-themes/demo-16-aliens.webp";
import dummyProfile17TravelCover from "../assets/story-card-backgrounds/user-themes/demo-17-travel.webp";
import dummyProfile18GoofyCartoonCover from "../assets/story-card-backgrounds/user-themes/demo-18-goofy-cartoon.webp";
import dummyProfile19ConcreteJungleCover from "../assets/story-card-backgrounds/user-themes/demo-19-concrete-jungle.webp";
import dummyProfile20CraftySpaceCover from "../assets/story-card-backgrounds/user-themes/demo-20-crafty-space.webp";
import voidPopCover from "../assets/story-card-backgrounds/void-pop.png";
import philBattlePixelCover from "../assets/story-card-backgrounds/story-covers/phil-battle-pixel.png";
import philKetaminePrisonCover from "../assets/story-card-backgrounds/story-covers/phil-ketamine-prison.png";
import type { CSSProperties } from "react";
import type { PlatformProfile } from "../data/platformSeed";

type LandingPageProps = {
  onSelectProfile: (profileId: string) => void;
  onSelectStory: (storyId: string) => void;
  profiles: PlatformProfile[];
  searchQuery: string;
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
const DUMMY_PROFILE_CARD_CLASSES = [
  "h-72 sm:h-80",
  "h-52 sm:h-60",
  "h-80 sm:h-96",
  "h-56 sm:h-72",
  "h-64 sm:h-80",
  "h-48 sm:h-56",
  "h-[21rem] sm:h-[27rem]",
  "h-60 sm:h-72",
  "h-[18rem] sm:h-[22rem]",
  "h-72 sm:h-[30rem]",
  "h-52 sm:h-64",
  "h-[23rem] sm:h-[29rem]",
  "h-56 sm:h-60",
  "h-80 sm:h-[26rem]",
  "h-64 sm:h-72",
  "h-[19rem] sm:h-[24rem]",
  "h-72 sm:h-96",
  "h-48 sm:h-64",
  "h-[22rem] sm:h-[28rem]",
  "h-60 sm:h-80"
];
const DUMMY_STORY_CARD_CLASSES = [
  "h-72 sm:h-80",
  "h-56 sm:h-64",
  "h-80",
  "h-64",
  "h-[22rem]",
  "h-72",
  "h-[19rem]",
  "h-80",
  "h-60",
  "h-[24rem]",
  "h-64",
  "h-[21rem]",
  "h-56",
  "h-72",
  "h-[23rem]",
  "h-60",
  "h-80",
  "h-[20rem]",
  "h-72",
  "h-[25rem]"
];
const DUMMY_PROFILE_COVERS = [
  dummyProfile01Cover,
  dummyProfile02Cover,
  dummyProfile03Cover,
  dummyProfile04Cover,
  dummyProfile05Cover,
  dummyProfile06Cover,
  dummyProfile07Cover,
  dummyProfile08Cover,
  dummyProfile09Cover,
  dummyProfile10Cover,
  dummyProfile11Cover,
  dummyProfile12Cover,
  dummyProfile13Cover,
  dummyProfile14Cover,
  dummyProfile15Cover,
  dummyProfile16Cover,
  dummyProfile17Cover,
  dummyProfile18Cover,
  dummyProfile19Cover,
  dummyProfile20Cover
];

const DUMMY_THEMED_PROFILE_COVERS: Record<
  string,
  Pick<ProfileCover, "image" | "objectPosition">
> = {
  "user-dummy-01": {
    image: dummyProfile01AnimeCover,
    objectPosition: "50% 50%"
  },
  "user-dummy-02": {
    image: dummyProfile02CyberpunkCover,
    objectPosition: "54% 50%"
  },
  "user-dummy-03": {
    image: dummyProfile03AbstractArtCover,
    objectPosition: "50% 50%"
  },
  "user-dummy-04": {
    image: dummyProfile04VegetationCover,
    objectPosition: "50% 50%"
  },
  "user-dummy-05": {
    image: dummyProfile05BrutalistDecorCover,
    objectPosition: "50% 54%"
  },
  "user-dummy-06": {
    image: dummyProfile06SpaceStuffCover,
    objectPosition: "50% 50%"
  },
  "user-dummy-07": {
    image: dummyProfile07CuteStuffCover,
    objectPosition: "50% 50%"
  },
  "user-dummy-08": {
    image: dummyProfile08GamingCover,
    objectPosition: "50% 50%"
  },
  "user-dummy-09": {
    image: dummyProfile09HandDrawnArtCover,
    objectPosition: "50% 50%"
  },
  "user-dummy-10": {
    image: dummyProfile10StencilArtCover,
    objectPosition: "50% 50%"
  },
  "user-dummy-11": {
    image: dummyProfile11FoodCover,
    objectPosition: "50% 50%"
  },
  "user-dummy-12": {
    image: dummyProfile12AnimalsNatureCover,
    objectPosition: "50% 50%"
  },
  "user-dummy-13": {
    image: dummyProfile13CosplayCover,
    objectPosition: "50% 42%"
  },
  "user-dummy-14": {
    image: dummyProfile14ComputerGeekCover,
    objectPosition: "50% 54%"
  },
  "user-dummy-15": {
    image: dummyProfile15PastelCraftsCover,
    objectPosition: "50% 50%"
  },
  "user-dummy-16": {
    image: dummyProfile16AliensCover,
    objectPosition: "50% 50%"
  },
  "user-dummy-17": {
    image: dummyProfile17TravelCover,
    objectPosition: "50% 50%"
  },
  "user-dummy-18": {
    image: dummyProfile18GoofyCartoonCover,
    objectPosition: "50% 50%"
  },
  "user-dummy-19": {
    image: dummyProfile19ConcreteJungleCover,
    objectPosition: "50% 54%"
  },
  "user-dummy-20": {
    image: dummyProfile20CraftySpaceCover,
    objectPosition: "50% 50%"
  }
};

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

const STORY_COVERS: Record<
  string,
  Pick<ProfileCover, "image" | "objectPosition">
> = {
  "story-phil-1": {
    image: philKetaminePrisonCover,
    objectPosition: "50% 48%"
  },
  "story-phil-battle": {
    image: philBattlePixelCover,
    objectPosition: "50% 50%"
  }
};

function getDummyProfileCover(profile: PlatformProfile): ProfileCover | null {
  const match = /^user-dummy-(\d{2})$/.exec(profile.id);

  if (!match) {
    return null;
  }

  const index = Number(match[1]) - 1;
  const themedCover = DUMMY_THEMED_PROFILE_COVERS[profile.id];
  const image = themedCover?.image ?? DUMMY_PROFILE_COVERS[index];

  if (!image) {
    return null;
  }

  return {
    accentColor: profile.accentColor,
    image,
    objectPosition: themedCover?.objectPosition ?? "50% 50%",
    profileClassName:
      DUMMY_PROFILE_CARD_CLASSES[index % DUMMY_PROFILE_CARD_CLASSES.length],
    storyClassName:
      DUMMY_STORY_CARD_CLASSES[index % DUMMY_STORY_CARD_CLASSES.length]
  };
}

function getProfileCover(profile: PlatformProfile) {
  return (
    PROFILE_COVERS[profile.id] ??
    getDummyProfileCover(profile) ?? {
      accentColor: profile.accentColor,
      image: "",
      objectPosition: "50% 50%",
      profileClassName: DEFAULT_PROFILE_CARD_CLASS,
      storyClassName: DEFAULT_STORY_CARD_CLASS
    }
  );
}

function sceneCountLabel(count: number) {
  return `${count} ${count === 1 ? "scene" : "scenes"}`;
}

function storyCountLabel(count: number) {
  return `${count} ${count === 1 ? "story" : "stories"}`;
}

function getCoverFallbackStyle(color: string): CSSProperties {
  return {
    background: `linear-gradient(135deg, rgba(248, 250, 252, 0.94) 0%, ${color} 48%, rgba(15, 23, 42, 0.62) 100%)`
  };
}

function normalizeSearchQuery(value: string) {
  return value.trim().toLowerCase();
}

function matchesProfileSearch(profile: PlatformProfile, query: string) {
  const handleQuery = query.replace(/^@+/, "");

  return (
    profile.displayName.toLowerCase().includes(query) ||
    profile.username.toLowerCase().includes(handleQuery)
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

export function LandingPage({
  onSelectProfile,
  onSelectStory,
  profiles,
  searchQuery,
  selectedProfileId
}: LandingPageProps) {
  const selectedProfile =
    profiles.find((profile) => profile.id === selectedProfileId) ?? null;
  const visibleProfiles = filterProfilesForSearch(profiles, searchQuery);

  if (selectedProfile) {
    const selectedCover = getProfileCover(selectedProfile);

    return (
      <section className="mx-auto grid w-full max-w-6xl gap-5">
        <div className="text-center">
          <h2 className="font-round text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl dark:text-slate-50">
            {selectedProfile.displayName}
          </h2>
          <p className="mt-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
            @{selectedProfile.username} · {storyCountLabel(selectedProfile.stories.length)}
          </p>
        </div>

        <div
          aria-label="Story bento grid"
          className="w-full columns-1 gap-4 overflow-y-auto pb-24 sm:columns-2 lg:columns-3"
        >
          {selectedProfile.stories.map((story, index) => {
            const label = sceneCountLabel(story.sceneCount);
            const storyCover = STORY_COVERS[story.storyId] ?? selectedCover;
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
                className={`group relative mb-4 grid w-full break-inside-avoid overflow-hidden rounded-lg text-left text-white shadow-[0_16px_40px_rgba(15,23,42,0.18)] ring-1 ring-slate-900/10 transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_22px_54px_rgba(15,23,42,0.22)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 dark:ring-white/12 ${heightClass}`}
                style={getCoverFallbackStyle(selectedCover.accentColor)}
              >
                <span
                  aria-hidden="true"
                  data-testid={`story-card-background-${story.storyId}`}
                  className="absolute inset-0"
                >
                  {storyCover.image ? (
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
                      style={getCoverFallbackStyle(story.coverColor)}
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
    <section className="mx-auto grid w-full max-w-7xl gap-5">
      <div className="text-center">
        <h2 className="font-round text-5xl font-semibold tracking-tight text-slate-950 sm:text-6xl dark:text-slate-50">
          chatsim
        </h2>
      </div>

      <div
        aria-label="Profile masonry"
        className="w-full columns-2 gap-4 overflow-y-auto pb-24 sm:columns-3 lg:columns-5"
      >
        {visibleProfiles.map((profile, index) => {
          const profileCover = getProfileCover(profile);
          const label = storyCountLabel(profile.stories.length);

          return (
            <button
              key={profile.id}
              type="button"
              aria-label={`Open ${profile.displayName}, ${label}`}
              onClick={() => onSelectProfile(profile.id)}
              className={`group relative mb-4 grid w-full break-inside-avoid overflow-hidden rounded-lg text-left text-white shadow-[0_16px_40px_rgba(15,23,42,0.16)] ring-1 ring-slate-900/10 transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_22px_54px_rgba(15,23,42,0.2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 dark:ring-white/12 ${profileCover.profileClassName}`}
              style={getCoverFallbackStyle(profileCover.accentColor)}
            >
              <span
                aria-hidden="true"
                data-testid={`profile-card-background-${profile.id}`}
                className="absolute inset-0"
              >
                {profileCover.image ? (
                  <img
                    alt=""
                    decoding="async"
                    draggable={false}
                    loading={index < 10 ? "eager" : "lazy"}
                    src={profileCover.image}
                    className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                    style={{ objectPosition: profileCover.objectPosition }}
                  />
                ) : (
                  <span
                    className="block h-full w-full"
                    style={getCoverFallbackStyle(profileCover.accentColor)}
                  />
                )}
              </span>
              <span
                aria-hidden="true"
                className="absolute inset-0 bg-[linear-gradient(180deg,rgba(2,6,23,0.16)_0%,rgba(2,6,23,0.06)_42%,rgba(2,6,23,0.52)_100%)]"
              />
              <span className="relative z-10 grid h-full content-between gap-3 p-3.5">
                <span className="min-w-0">
                  <span className="block truncate font-round text-lg font-bold text-white drop-shadow-[0_2px_10px_rgba(2,6,23,0.5)]">
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
