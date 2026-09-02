import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, RefreshCw, ShieldCheck } from "lucide-react";
import {
  fetchAdminAccounts,
  performAdminAccountAction,
  type AdminAccount
} from "../api/storyApi";

type AdminAccountsPageProps = {
  onBack: () => void;
};

type AccountAction = Parameters<typeof performAdminAccountAction>[1];

export function AdminAccountsPage({ onBack }: AdminAccountsPageProps) {
  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const payload = await fetchAdminAccounts();
      setAccounts(payload.accounts);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load accounts.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(account: AdminAccount, action: AccountAction) {
    setBusyId(account.id);
    setError("");
    try {
      await performAdminAccountAction(account.id, action);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Account action failed.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="app-background app-background--landing min-h-dvh px-4 py-6 text-[color:var(--text)] sm:px-6 sm:py-10">
      <div className="mx-auto grid w-full max-w-5xl gap-4">
        <button
          type="button"
          onClick={onBack}
          className="flex w-fit items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold text-[color:var(--muted)] transition hover:bg-white/[0.06] hover:text-[color:var(--text)]"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to stories
        </button>

        <section className="app-glass grid gap-5 rounded-2xl p-5 shadow-2xl sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.18em] text-[color:var(--neon-1)]">
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                Restricted admin
              </p>
              <h1 className="mt-2 text-2xl font-black sm:text-3xl">Creator accounts</h1>
              <p className="mt-2 max-w-xl text-sm text-[color:var(--muted)]">
                Review registrations, disable access, and revoke sessions. Roles, passwords,
                impersonation, and deletion are deliberately unavailable.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void load()}
              disabled={isLoading}
              className="flex h-10 items-center gap-2 rounded-lg bg-white/[0.06] px-4 text-sm font-bold ring-1 ring-[color:var(--line)] transition hover:bg-white/[0.1] disabled:opacity-50"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Refresh
            </button>
          </div>

          {error ? <p role="alert" className="rounded-lg bg-rose-400/[0.1] p-3 text-sm font-bold text-rose-200">{error}</p> : null}
          {isLoading && accounts.length === 0 ? (
            <p className="py-10 text-center text-sm text-[color:var(--muted)]">Loading accounts…</p>
          ) : accounts.length === 0 ? (
            <p className="py-10 text-center text-sm text-[color:var(--muted)]">No accounts yet.</p>
          ) : (
            <div className="grid gap-3">
              {accounts.map((account) => {
                const disabled = busyId === account.id;
                return (
                  <article
                    key={account.id}
                    className="grid gap-4 rounded-xl border border-[color:var(--line)] bg-white/[0.03] p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-extrabold">@{account.username}</p>
                        <span className="rounded-full bg-white/[0.07] px-2 py-1 text-[11px] font-bold uppercase text-[color:var(--muted)]">
                          {account.approvalStatus}
                        </span>
                        {account.disabled ? (
                          <span className="rounded-full bg-rose-400/[0.12] px-2 py-1 text-[11px] font-bold uppercase text-rose-200">disabled</span>
                        ) : null}
                      </div>
                      <p className="mt-1 truncate text-sm text-[color:var(--muted)]">{account.email}</p>
                      <p className="mt-1 text-xs text-[color:var(--muted)]">
                        {account.emailVerified ? "Verified email" : "Unverified email"} · {account.sessionCount} active {account.sessionCount === 1 ? "session" : "sessions"}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 lg:justify-end">
                      {account.approvalStatus === "pending" ? (
                        <>
                          <button type="button" aria-label={`Approve ${account.username}`} onClick={() => void act(account, "approve")} disabled={disabled} className="h-9 rounded-lg bg-emerald-400/15 px-3 text-xs font-extrabold text-emerald-200 transition hover:bg-emerald-400/25 disabled:opacity-50">Approve</button>
                          <button type="button" aria-label={`Reject ${account.username}`} onClick={() => void act(account, "reject")} disabled={disabled} className="h-9 rounded-lg bg-rose-400/10 px-3 text-xs font-extrabold text-rose-200 transition hover:bg-rose-400/20 disabled:opacity-50">Reject</button>
                        </>
                      ) : null}
                      <button type="button" aria-label={`${account.disabled ? "Enable" : "Disable"} ${account.username}`} onClick={() => void act(account, account.disabled ? "enable" : "disable")} disabled={disabled} className="h-9 rounded-lg bg-white/[0.06] px-3 text-xs font-extrabold transition hover:bg-white/[0.1] disabled:opacity-50">{account.disabled ? "Enable" : "Disable"}</button>
                      <button type="button" aria-label={`Revoke sessions for ${account.username}`} onClick={() => void act(account, "revoke-sessions")} disabled={disabled || account.sessionCount === 0} className="h-9 rounded-lg bg-white/[0.06] px-3 text-xs font-extrabold transition hover:bg-white/[0.1] disabled:opacity-50">Revoke sessions</button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
