import type { FormEvent } from "react";
import { LogIn, LogOut, Plus, UserPlus } from "lucide-react";
import type { PlatformSession } from "../data/platformSeed";

export type AuthMode = "login" | "register";

type AccountPanelProps = {
  accountError: string;
  authMode: AuthMode;
  isBusy: boolean;
  password: string;
  session: PlatformSession | null;
  username: string;
  onAuthModeChange: (mode: AuthMode) => void;
  onCreateStory: () => void;
  onLogout: () => void;
  onPasswordChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onUsernameChange: (value: string) => void;
};

export function AccountPanel({
  accountError,
  authMode,
  isBusy,
  password,
  session,
  username,
  onAuthModeChange,
  onCreateStory,
  onLogout,
  onPasswordChange,
  onSubmit,
  onUsernameChange
}: AccountPanelProps) {
  return (
    <div
      role="dialog"
      aria-label="Account panel"
      className="app-glass absolute right-0 top-14 z-40 grid w-[min(340px,calc(100vw-24px))] gap-3 rounded-lg p-4 text-left shadow-2xl"
    >
      {session ? (
        <>
          <div>
            <p className="text-xs font-bold uppercase text-[color:var(--muted)]">
              Signed in
            </p>
            <p className="mt-1 text-base font-extrabold text-[color:var(--text)]">
              {session.user.displayName}
            </p>
          </div>
          <button
            type="button"
            onClick={onCreateStory}
            disabled={isBusy}
            className="flex h-10 items-center justify-center gap-2 rounded-lg bg-[color:var(--neon-1)] px-4 text-sm font-bold text-[color:var(--base)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Create story
          </button>
          <button
            type="button"
            onClick={onLogout}
            disabled={isBusy}
            className="flex h-10 items-center justify-center gap-2 rounded-lg bg-white/[0.04] px-4 text-sm font-bold text-[color:var(--text)] ring-1 ring-[color:var(--line)] transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:text-slate-400"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Logout
          </button>
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-white/[0.06] p-1">
            <button
              type="button"
              onClick={() => onAuthModeChange("login")}
              className={`h-9 rounded-lg text-sm font-bold transition ${
                authMode === "login"
                  ? "bg-white/[0.12] text-[color:var(--text)] shadow-sm"
                  : "text-[color:var(--muted)] hover:text-[color:var(--text)]"
              }`}
            >
              Login
            </button>
            <button
              type="button"
              onClick={() => onAuthModeChange("register")}
              className={`h-9 rounded-lg text-sm font-bold transition ${
                authMode === "register"
                  ? "bg-white/[0.12] text-[color:var(--text)] shadow-sm"
                  : "text-[color:var(--muted)] hover:text-[color:var(--text)]"
              }`}
            >
              Create
            </button>
          </div>
          <form className="grid gap-3" onSubmit={onSubmit}>
            <label className="text-xs font-bold uppercase text-[color:var(--muted)]">
              Username
              <input
                aria-label="Username"
                value={username}
                onChange={(event) => onUsernameChange(event.target.value)}
                className="mt-1 h-10 w-full rounded-lg border border-[color:var(--line)] bg-white/[0.04] px-3 text-sm font-semibold normal-case text-[color:var(--text)] outline-none transition focus:ring-2 focus:ring-[color:var(--neon-1)]"
              />
            </label>
            <label className="text-xs font-bold uppercase text-[color:var(--muted)]">
              Password
              <input
                aria-label="Password"
                type="password"
                value={password}
                onChange={(event) => onPasswordChange(event.target.value)}
                className="mt-1 h-10 w-full rounded-lg border border-[color:var(--line)] bg-white/[0.04] px-3 text-sm font-semibold normal-case text-[color:var(--text)] outline-none transition focus:ring-2 focus:ring-[color:var(--neon-1)]"
              />
            </label>
            {accountError ? (
              <p className="text-sm font-semibold text-rose-300">
                {accountError}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={isBusy}
              className="flex h-10 items-center justify-center gap-2 rounded-lg bg-[color:var(--neon-1)] px-4 text-sm font-bold text-[color:var(--base)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:bg-slate-400"
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
        <p className="text-sm font-semibold text-rose-300">{accountError}</p>
      ) : null}
    </div>
  );
}
