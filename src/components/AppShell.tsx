import type { ReactNode } from "react";
import {
  ChevronLeft,
  Compass,
  Home,
  Plus,
  Search,
  UserCircle
} from "lucide-react";
import type { PlatformProfile } from "../data/platformSeed";

type AppShellProps = {
  accountPanel: ReactNode;
  backgroundModeClass: string;
  children: ReactNode;
  isStoryListOpen: boolean;
  searchQuery: string;
  selectedProfile: PlatformProfile | null;
  toolbarActions: ReactNode;
  onAccountToggle: () => void;
  onActiveProfile: () => void;
  onCreateStory: () => void;
  onHome: () => void;
  onSearchQueryChange: (value: string) => void;
};

export function AppShell({
  accountPanel,
  backgroundModeClass,
  children,
  isStoryListOpen,
  searchQuery,
  selectedProfile,
  toolbarActions,
  onAccountToggle,
  onActiveProfile,
  onCreateStory,
  onHome,
  onSearchQueryChange
}: AppShellProps) {
  const isHomeBrowsing = isStoryListOpen && !selectedProfile;
  const topBarHeightClass = isHomeBrowsing ? "min-h-[72px]" : "min-h-14";
  const mainHeightClass = isHomeBrowsing
    ? "min-h-[calc(100dvh-72px)]"
    : "min-h-[calc(100dvh-56px)]";

  return (
    <div
      aria-label="App shell"
      className={`app-background ${backgroundModeClass} relative min-h-screen overflow-hidden text-slate-950`}
    >
      <nav
        aria-label="Desktop navigation"
        className="fixed inset-y-0 left-0 z-30 hidden w-20 flex-col items-center border-r border-slate-200/80 bg-white/95 py-5 shadow-[8px_0_28px_rgba(15,23,42,0.05)] backdrop-blur-xl md:flex"
      >
        <button
          type="button"
          aria-label="Account"
          title="Account"
          onClick={onAccountToggle}
          className="grid h-11 w-11 place-items-center rounded-lg text-slate-800 transition hover:bg-slate-100"
        >
          <UserCircle className="h-6 w-6" aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="Home"
          title="Home"
          onClick={onHome}
          className="mt-3 grid h-11 w-11 place-items-center rounded-lg text-rose-600 transition hover:bg-rose-50"
        >
          <Home className="h-6 w-6" aria-hidden="true" />
        </button>
        <div className="mt-8 grid gap-4">
          <button
            type="button"
            aria-label="Explore"
            title="Explore"
            onClick={onHome}
            className="grid h-11 w-11 place-items-center rounded-lg text-slate-800 transition hover:bg-slate-100"
          >
            <Compass className="h-6 w-6" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Create story"
            title="Create story"
            onClick={onCreateStory}
            className="grid h-11 w-11 place-items-center rounded-lg text-slate-800 transition hover:bg-slate-100"
          >
            <Plus className="h-6 w-6" aria-hidden="true" />
          </button>
        </div>
      </nav>

      <div className={`sticky top-0 z-20 flex ${topBarHeightClass} items-center gap-2 border-b border-slate-200/80 bg-white/95 px-3 shadow-[0_8px_28px_rgba(15,23,42,0.05)] backdrop-blur-xl md:pl-24 md:pr-5`}>
        {!isStoryListOpen ? (
          <button
            type="button"
            aria-label="Back to profile"
            title="Back to profile"
            onClick={onActiveProfile}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-slate-800 transition hover:bg-slate-100"
          >
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          </button>
        ) : selectedProfile ? (
          <button
            type="button"
            aria-label="Back to home"
            title="Back to home"
            onClick={onHome}
            className="inline-flex h-11 shrink-0 items-center gap-2 rounded-lg px-2 text-sm font-bold text-slate-800 transition hover:bg-slate-100 sm:px-3"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Home</span>
          </button>
        ) : null}

        {isHomeBrowsing ? (
          <label className="relative flex h-12 min-w-0 flex-1 items-center rounded-lg bg-slate-100 text-slate-600 ring-1 ring-slate-200 transition focus-within:bg-white focus-within:ring-slate-300">
            <span className="sr-only">Search stories</span>
            <Search className="ml-4 h-5 w-5 shrink-0" aria-hidden="true" />
            <input
              aria-label="Search stories"
              type="search"
              value={searchQuery}
              onChange={(event) => onSearchQueryChange(event.target.value)}
              className="h-full min-w-0 flex-1 bg-transparent px-3 text-base font-semibold text-slate-900 outline-none placeholder:text-slate-500"
              placeholder="Search"
            />
          </label>
        ) : (
          <span aria-hidden="true" className="min-w-0 flex-1" />
        )}

        <div className="relative ml-auto flex shrink-0 items-center gap-1.5">
          {toolbarActions}
          {accountPanel}
        </div>
      </div>

      <main className={`relative z-10 ${mainHeightClass} px-3 pb-24 pt-5 md:pb-6 md:pl-24 md:pr-6 md:pt-6`}>
        {children}
      </main>

      <nav
        aria-label="Mobile navigation"
        className="fixed inset-x-0 bottom-0 z-30 grid h-20 grid-cols-4 border-t border-slate-200 bg-white/95 px-5 pb-3 pt-2 shadow-[0_-8px_28px_rgba(15,23,42,0.08)] backdrop-blur-xl md:hidden"
      >
        <button
          type="button"
          aria-label="Home"
          onClick={onHome}
          className="grid place-items-center rounded-lg text-slate-900 transition hover:bg-slate-100"
        >
          <Home className="h-7 w-7" aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="Explore"
          onClick={onHome}
          className="grid place-items-center rounded-lg text-slate-700 transition hover:bg-slate-100"
        >
          <Search className="h-7 w-7" aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="Create"
          onClick={onCreateStory}
          className="grid place-items-center rounded-lg text-slate-700 transition hover:bg-slate-100"
        >
          <Plus className="h-7 w-7" aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="Account"
          onClick={onAccountToggle}
          className="grid place-items-center rounded-lg text-slate-700 transition hover:bg-slate-100"
        >
          <UserCircle className="h-7 w-7" aria-hidden="true" />
        </button>
      </nav>
    </div>
  );
}
