import { useState, type FormEvent } from "react";
import {
  ChevronLeft,
  LogIn,
  LogOut,
  Plus,
  Settings,
  UserPlus
} from "lucide-react";
import motelLobbyCover from "../assets/story-card-backgrounds/motel-lobby.png";
import neonSleepoverCover from "../assets/story-card-backgrounds/neon-sleepover.png";
import orbitThreadsCover from "../assets/story-card-backgrounds/orbit-threads.png";
import philStoriesCover from "../assets/story-card-backgrounds/phil-stories.png";
import voidPopCover from "../assets/story-card-backgrounds/void-pop.png";
import type {
  PlatformProfile,
  PlatformSession
} from "../data/platformSeed";

type LandingPageProps = {
  onCreateStory: () => Promise<void>;
  onLogin: (input: { password: string; username: string }) => Promise<void>;
  onLogout: () => Promise<void>;
  onRegister: (input: {
    displayName: string;
    password: string;
    username: string;
  }) => Promise<void>;
  onSelectStory: (storyId: string) => void;
  profiles: PlatformProfile[];
  session: PlatformSession | null;
};

type AuthMode = "login" | "register";

type ProfileCover = {
  accentColor: string;
  className: string;
  image: string;
  objectPosition: string;
};

const DEFAULT_PROFILE_CARD_CLASS = "row-span-2 sm:row-span-1";

const PROFILE_COVERS: Record<string, ProfileCover> = {
  "user-phil": {
    accentColor: "#f472b6",
    className: "row-span-3 sm:col-span-2 sm:row-span-2",
    image: philStoriesCover,
    objectPosition: "50% 52%"
  },
  "user-neon": {
    accentColor: "#22d3ee",
    className: "row-span-2 sm:row-span-1",
    image: neonSleepoverCover,
    objectPosition: "50% 48%"
  },
  "user-orbit": {
    accentColor: "#a3e635",
    className: "row-span-2 sm:row-span-1",
    image: orbitThreadsCover,
    objectPosition: "56% 50%"
  },
  "user-motel": {
    accentColor: "#f59e0b",
    className: "row-span-3 sm:row-span-1",
    image: motelLobbyCover,
    objectPosition: "54% 58%"
  },
  "user-void": {
    accentColor: "#8b5cf6",
    className: "row-span-2 sm:row-span-1",
    image: voidPopCover,
    objectPosition: "48% 50%"
  }
};

export function LandingPage({
  onCreateStory,
  onLogin,
  onLogout,
  onRegister,
  onSelectStory,
  profiles,
  session
}: LandingPageProps) {
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(
    null
  );
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [accountError, setAccountError] = useState("");

  const submitAuth = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsBusy(true);
    setAccountError("");

    try {
      if (authMode === "register") {
        await onRegister({ displayName, password, username });
      } else {
        await onLogin({ password, username });
      }

      setPassword("");
      setIsAccountOpen(false);
    } catch (error) {
      setAccountError(
        error instanceof Error ? error.message : "Account request failed."
      );
    } finally {
      setIsBusy(false);
    }
  };

  const createStory = async () => {
    setIsBusy(true);
    setAccountError("");

    try {
      await onCreateStory();
      setIsAccountOpen(false);
    } catch (error) {
      setAccountError(
        error instanceof Error ? error.message : "Could not create story."
      );
    } finally {
      setIsBusy(false);
    }
  };

  const logout = async () => {
    setIsBusy(true);
    setAccountError("");

    try {
      await onLogout();
      setIsAccountOpen(false);
    } catch (error) {
      setAccountError(error instanceof Error ? error.message : "Logout failed.");
    } finally {
      setIsBusy(false);
    }
  };
  const selectedProfile =
    profiles.find((profile) => profile.id === selectedProfileId) ?? null;

  return (
    <section className="grid h-[min(86vh,820px)] w-full max-w-5xl grid-rows-[auto_minmax(0,1fr)] gap-5 px-3 sm:px-6">
      <header className="relative grid justify-items-center gap-2">
        <h1 className="text-5xl font-bold tracking-normal text-slate-950">
          chatsim
        </h1>
        {!selectedProfile ? (
          <button
            type="button"
            aria-expanded={isAccountOpen}
            aria-label="Account settings"
            title="Account settings"
            onClick={() => setIsAccountOpen((isOpen) => !isOpen)}
            className="absolute right-0 top-1 grid h-11 w-11 place-items-center rounded-full border border-white/50 bg-white/35 text-slate-800 shadow-[0_12px_36px_rgba(15,23,42,0.18)] backdrop-blur-2xl transition hover:bg-white/55"
          >
            <Settings className="h-5 w-5" aria-hidden="true" />
          </button>
        ) : null}

        {!selectedProfile && isAccountOpen ? (
          <div
            role="dialog"
            aria-label="Account panel"
            className="absolute right-0 top-14 z-20 grid w-[min(330px,calc(100vw-32px))] gap-3 rounded-2xl border border-white/65 bg-white/92 p-4 text-left shadow-2xl backdrop-blur-2xl"
          >
            {session ? (
              <>
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                    Signed in
                  </p>
                  <p className="mt-1 text-base font-extrabold text-slate-950">
                    {session.user.displayName}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={createStory}
                  disabled={isBusy}
                  className="flex h-10 items-center justify-center gap-2 rounded-full bg-slate-950 px-4 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Create story
                </button>
                <button
                  type="button"
                  onClick={logout}
                  disabled={isBusy}
                  className="flex h-10 items-center justify-center gap-2 rounded-full bg-white px-4 text-sm font-bold text-slate-800 ring-1 ring-slate-200 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
                >
                  <LogOut className="h-4 w-4" aria-hidden="true" />
                  Logout
                </button>
              </>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-1 rounded-full bg-slate-100 p-1">
                  <button
                    type="button"
                    onClick={() => setAuthMode("login")}
                    className={`h-9 rounded-full text-sm font-bold transition ${
                      authMode === "login"
                        ? "bg-white text-slate-950 shadow-sm"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    Login
                  </button>
                  <button
                    type="button"
                    onClick={() => setAuthMode("register")}
                    className={`h-9 rounded-full text-sm font-bold transition ${
                      authMode === "register"
                        ? "bg-white text-slate-950 shadow-sm"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    Create
                  </button>
                </div>
                <form className="grid gap-3" onSubmit={submitAuth}>
                  <label className="text-xs font-bold uppercase tracking-[0.12em] text-slate-600">
                    Username
                    <input
                      aria-label="Username"
                      value={username}
                      onChange={(event) => setUsername(event.target.value)}
                      className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold normal-case tracking-normal text-slate-950 outline-none transition focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
                    />
                  </label>
                  {authMode === "register" ? (
                    <label className="text-xs font-bold uppercase tracking-[0.12em] text-slate-600">
                      Display name
                      <input
                        aria-label="Display name"
                        value={displayName}
                        onChange={(event) => setDisplayName(event.target.value)}
                        className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold normal-case tracking-normal text-slate-950 outline-none transition focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
                      />
                    </label>
                  ) : null}
                  <label className="text-xs font-bold uppercase tracking-[0.12em] text-slate-600">
                    Password
                    <input
                      aria-label="Password"
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold normal-case tracking-normal text-slate-950 outline-none transition focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
                    />
                  </label>
                  {accountError ? (
                    <p className="text-sm font-semibold text-rose-700">
                      {accountError}
                    </p>
                  ) : null}
                  <button
                    type="submit"
                    disabled={isBusy}
                    className="flex h-10 items-center justify-center gap-2 rounded-full bg-slate-950 px-4 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                  >
                    {authMode === "register" ? (
                      <UserPlus className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <LogIn className="h-4 w-4" aria-hidden="true" />
                    )}
                    {authMode === "register" ? "Create account" : "Login"}
                  </button>
                </form>
              </>
            )}
            {session && accountError ? (
              <p className="text-sm font-semibold text-rose-700">
                {accountError}
              </p>
            ) : null}
          </div>
        ) : null}
      </header>

      {selectedProfile ? (
        <section className="grid min-h-0 content-start justify-items-center gap-3 pt-1 sm:pt-2">
          <div className="grid w-full max-w-[420px] gap-2">
            <button
              type="button"
              aria-label="Back to profiles"
              onClick={() => setSelectedProfileId(null)}
              className="flex h-8 w-fit items-center gap-1.5 rounded-full border border-white/55 bg-white/32 px-3 text-xs font-black lowercase tracking-normal text-slate-800 shadow-[0_8px_24px_rgba(15,23,42,0.12)] backdrop-blur-2xl transition hover:bg-white/55"
            >
              <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
              profiles
            </button>
            <div className="text-center">
              <h2 className="text-[1.7rem] font-black leading-none tracking-normal text-slate-950">
                {selectedProfile.displayName}
              </h2>
              <p className="mt-1 text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
                {selectedProfile.stories.length}{" "}
                {selectedProfile.stories.length === 1 ? "story" : "stories"}
              </p>
            </div>
          </div>
          <div
            aria-label="Story list"
            className="grid max-h-[min(58vh,440px)] w-full max-w-[420px] content-start gap-2 overflow-y-auto px-1 py-1"
          >
            {selectedProfile.stories.map((story) => (
              <button
                key={story.storyId}
                type="button"
                onClick={() => onSelectStory(story.storyId)}
                className="group flex min-h-[54px] w-full items-center gap-3 rounded-full border border-sky-300/70 bg-sky-50/75 px-4 py-2 text-left text-slate-950 shadow-none transition duration-200 hover:-translate-y-0.5 hover:border-sky-400/75 hover:bg-sky-100/80"
              >
                <span
                  aria-hidden="true"
                  data-testid={`story-selector-accent-${story.storyId}`}
                  className="h-8 w-8 shrink-0 rounded-full border border-white/70 bg-sky-400 shadow-inner shadow-sky-700/10"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base font-extrabold tracking-normal">
                    {story.title}
                  </span>
                </span>
                <span className="rounded-full border border-white/60 bg-white/55 px-3 py-1 text-xs font-black uppercase tracking-[0.1em] shadow-inner backdrop-blur-xl">
                  {story.sceneCount}{" "}
                  {story.sceneCount === 1 ? "scene" : "scenes"}
                </span>
              </button>
            ))}
          </div>
        </section>
      ) : (
        <div
          aria-label="Profile grid"
          className="grid min-h-0 auto-rows-[64px] grid-cols-2 gap-3 overflow-y-auto px-1 pb-2 sm:auto-rows-[132px] sm:grid-cols-2 lg:auto-rows-[154px] lg:grid-cols-4"
        >
          {profiles.map((profile) => {
            const profileCover = PROFILE_COVERS[profile.id];
            const cardAccent = profileCover?.accentColor ?? profile.accentColor;
            const storyCountLabel = `${profile.stories.length} ${
              profile.stories.length === 1 ? "story" : "stories"
            }`;

            return (
              <button
                key={profile.id}
                type="button"
                aria-label={`Open ${profile.displayName}, ${storyCountLabel}`}
                onClick={() => {
                  setIsAccountOpen(false);
                  setSelectedProfileId(profile.id);
                }}
                className={`group relative grid min-h-0 overflow-hidden rounded-lg border border-white/45 bg-slate-900/45 text-left text-white shadow-[0_18px_48px_rgba(15,23,42,0.2)] ring-1 ring-white/35 transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_22px_60px_rgba(15,23,42,0.24)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 ${
                  profileCover?.className ?? DEFAULT_PROFILE_CARD_CLASS
                }`}
              >
                <span
                  aria-hidden="true"
                  data-testid={`profile-card-background-${profile.id}`}
                  className="absolute inset-0"
                >
                  {profileCover ? (
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
                        background: `linear-gradient(135deg, ${cardAccent}, rgba(15, 23, 42, 0.72))`
                      }}
                    />
                  )}
                </span>
                <span
                  aria-hidden="true"
                  className="absolute inset-0 bg-[linear-gradient(180deg,rgba(15,23,42,0.62)_0%,rgba(15,23,42,0.2)_48%,rgba(15,23,42,0.74)_100%)]"
                />
                <span
                  aria-hidden="true"
                  className="absolute inset-x-0 top-0 z-10 h-1"
                  style={{ backgroundColor: cardAccent }}
                />
                <span className="relative z-10 grid h-full content-between gap-3 p-3 sm:p-4">
                  <span className="min-w-0">
                    <span className="block truncate text-lg font-black tracking-normal text-white drop-shadow-[0_2px_8px_rgba(15,23,42,0.5)] sm:text-xl">
                      {profile.displayName}
                    </span>
                    <span className="mt-1 block text-xs font-bold uppercase tracking-[0.12em] text-white/72 drop-shadow-[0_1px_6px_rgba(15,23,42,0.45)]">
                      @{profile.username}
                    </span>
                  </span>
                  <span className="w-fit rounded-full border border-white/40 bg-white/22 px-3 py-1 text-xs font-black uppercase tracking-[0.1em] text-white shadow-inner backdrop-blur-md">
                    {storyCountLabel}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
