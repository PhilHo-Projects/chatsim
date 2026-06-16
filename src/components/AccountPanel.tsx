import type { FormEvent } from "react";
import { LogIn, LogOut, Plus, UserPlus } from "lucide-react";
import type { PlatformSession } from "../data/platformSeed";

export type AuthMode = "login" | "register";

type AccountPanelProps = {
  accountError: string;
  authMode: AuthMode;
  displayName: string;
  isBusy: boolean;
  password: string;
  session: PlatformSession | null;
  username: string;
  onAuthModeChange: (mode: AuthMode) => void;
  onCreateStory: () => void;
  onDisplayNameChange: (value: string) => void;
  onLogout: () => void;
  onPasswordChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onUsernameChange: (value: string) => void;
};

export function AccountPanel({
  accountError,
  authMode,
  displayName,
  isBusy,
  password,
  session,
  username,
  onAuthModeChange,
  onCreateStory,
  onDisplayNameChange,
  onLogout,
  onPasswordChange,
  onSubmit,
  onUsernameChange
}: AccountPanelProps) {
  return (
    <div
      role="dialog"
      aria-label="Account panel"
      className="absolute right-0 top-14 z-40 grid w-[min(340px,calc(100vw-24px))] gap-3 rounded-lg border border-slate-200 bg-white/95 p-4 text-left shadow-2xl backdrop-blur-xl dark:border-slate-700/70 dark:bg-slate-900/95"
    >
      {session ? (
        <>
          <div>
            <p className="text-xs font-bold uppercase text-slate-500 dark:text-slate-400">
              Signed in
            </p>
            <p className="mt-1 text-base font-extrabold text-slate-950 dark:text-slate-50">
              {session.user.displayName}
            </p>
          </div>
          <button
            type="button"
            onClick={onCreateStory}
            disabled={isBusy}
            className="flex h-10 items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white dark:disabled:bg-slate-600"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Create story
          </button>
          <button
            type="button"
            onClick={onLogout}
            disabled={isBusy}
            className="flex h-10 items-center justify-center gap-2 rounded-lg bg-white px-4 text-sm font-bold text-slate-800 ring-1 ring-slate-200 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700 dark:hover:bg-slate-700"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Logout
          </button>
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => onAuthModeChange("login")}
              className={`h-9 rounded-lg text-sm font-bold transition ${
                authMode === "login"
                  ? "bg-white text-slate-950 shadow-sm dark:bg-slate-950 dark:text-slate-100"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
              }`}
            >
              Login
            </button>
            <button
              type="button"
              onClick={() => onAuthModeChange("register")}
              className={`h-9 rounded-lg text-sm font-bold transition ${
                authMode === "register"
                  ? "bg-white text-slate-950 shadow-sm dark:bg-slate-950 dark:text-slate-100"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
              }`}
            >
              Create
            </button>
          </div>
          <form className="grid gap-3" onSubmit={onSubmit}>
            <label className="text-xs font-bold uppercase text-slate-600 dark:text-slate-400">
              Username
              <input
                aria-label="Username"
                value={username}
                onChange={(event) => onUsernameChange(event.target.value)}
                className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold normal-case text-slate-950 outline-none transition focus:border-slate-300 focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-100 dark:focus:border-slate-600 dark:focus:ring-slate-700"
              />
            </label>
            {authMode === "register" ? (
              <label className="text-xs font-bold uppercase text-slate-600 dark:text-slate-400">
                Display name
                <input
                  aria-label="Display name"
                  value={displayName}
                  onChange={(event) => onDisplayNameChange(event.target.value)}
                  className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold normal-case text-slate-950 outline-none transition focus:border-slate-300 focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-100 dark:focus:border-slate-600 dark:focus:ring-slate-700"
                />
              </label>
            ) : null}
            <label className="text-xs font-bold uppercase text-slate-600 dark:text-slate-400">
              Password
              <input
                aria-label="Password"
                type="password"
                value={password}
                onChange={(event) => onPasswordChange(event.target.value)}
                className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold normal-case text-slate-950 outline-none transition focus:border-slate-300 focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-100 dark:focus:border-slate-600 dark:focus:ring-slate-700"
              />
            </label>
            {accountError ? (
              <p className="text-sm font-semibold text-rose-700 dark:text-rose-300">
                {accountError}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={isBusy}
              className="flex h-10 items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white dark:disabled:bg-slate-600"
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
        <p className="text-sm font-semibold text-rose-700 dark:text-rose-300">{accountError}</p>
      ) : null}
    </div>
  );
}
