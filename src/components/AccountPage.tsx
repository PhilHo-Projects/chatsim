import { useState, type FormEvent } from "react";
import { ArrowLeft, KeyRound, Mail } from "lucide-react";
import {
  changePassword,
  requestPasswordReset,
  requestVerificationEmail,
  resetPassword,
  type CurrentAccount
} from "../api/storyApi";

type AccountPageProps = {
  approvalComplete?: boolean;
  currentAccount: CurrentAccount;
  onBack: () => void;
  resetToken?: string | null;
  verificationComplete?: boolean;
};

function errorMessage(error: unknown) {
  return error instanceof Error && error.message
    ? error.message
    : "Something went wrong. Please try again.";
}

export function AccountPage({
  approvalComplete = false,
  currentAccount,
  onBack,
  resetToken = null,
  verificationComplete = false
}: AccountPageProps) {
  const [email, setEmail] = useState(currentAccount.account?.email ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(
    approvalComplete
      ? "Account approved. Return to stories to sign in."
      : verificationComplete
        ? "Email verified. If approval is required, an admin will review the account next."
        : ""
  );
  const { account, profile, session } = currentAccount;

  async function run(action: string, operation: () => Promise<void>) {
    setBusyAction(action);
    setError("");
    setNotice("");

    try {
      await operation();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusyAction(null);
    }
  }

  const resendVerification = () =>
    run("verify", async () => {
      await requestVerificationEmail(email);
      setNotice(
        "If that address can receive mail, a verification link is on its way."
      );
    });

  const requestReset = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void run("request-reset", async () => {
      await requestPasswordReset(email);
      setNotice(
        "If an account exists for that address, a password reset link is on its way."
      );
    });
  };

  const submitPassword = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void run("password", async () => {
      if (resetToken) {
        await resetPassword(resetToken, newPassword);
        setNotice("Password reset. You can return home and sign in.");
      } else {
        await changePassword(currentPassword, newPassword);
        setNotice("Password updated. Other sessions have been signed out.");
      }

      setCurrentPassword("");
      setNewPassword("");
    });
  };

  const status = account?.disabled
    ? "This account is disabled."
    : account?.approvalStatus === "rejected"
      ? "This account request was not approved."
      : account?.approvalStatus === "pending" && account.emailVerified
        ? "Your email is verified. This account is waiting for approval."
        : account && !account.emailVerified
          ? "Verify your email before this account can be used."
          : null;

  return (
    <main className="app-background app-background--landing min-h-dvh px-4 py-6 text-[color:var(--text)] sm:px-6 sm:py-10">
      <div className="mx-auto grid w-full max-w-2xl gap-4">
        <button
          type="button"
          onClick={onBack}
          className="flex w-fit items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold text-[color:var(--muted)] transition hover:bg-white/[0.06] hover:text-[color:var(--text)]"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to stories
        </button>

        <section className="app-glass grid gap-5 rounded-2xl p-5 shadow-2xl sm:p-7">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[color:var(--neon-1)]">
              Chatsim account
            </p>
            <h1 className="mt-2 text-2xl font-black sm:text-3xl">
              Account &amp; password
            </h1>
            {account ? (
              <p className="mt-2 text-sm text-[color:var(--muted)]">
                @{account.username} · {account.email}
              </p>
            ) : (
              <p className="mt-2 text-sm text-[color:var(--muted)]">
                Recover access without revealing whether an email is registered.
              </p>
            )}
          </div>

          {status ? (
            <div className="rounded-xl border border-amber-300/25 bg-amber-300/[0.08] p-4 text-sm font-semibold text-amber-100">
              {status}
            </div>
          ) : null}

          {account ? (
            <div className="grid gap-3 rounded-xl border border-[color:var(--line)] bg-white/[0.03] p-4">
              <div className="flex items-center gap-2 font-extrabold">
                <Mail className="h-4 w-4 text-[color:var(--neon-1)]" aria-hidden="true" />
                Email verification
              </div>
              <p className="text-sm text-[color:var(--muted)]">
                {account.emailVerified
                  ? "This email address is verified. You can resend the link if needed."
                  : "A verified email is required before sign-in or approval."}
              </p>
              <button
                type="button"
                onClick={() => void resendVerification()}
                disabled={busyAction !== null}
                className="h-10 rounded-lg bg-white/[0.06] px-4 text-sm font-bold ring-1 ring-[color:var(--line)] transition hover:bg-white/[0.1] disabled:opacity-50"
              >
                Resend verification
              </button>
            </div>
          ) : null}

          {resetToken || session ? (
            <form
              onSubmit={submitPassword}
              className="grid gap-3 rounded-xl border border-[color:var(--line)] bg-white/[0.03] p-4"
            >
              <div className="flex items-center gap-2 font-extrabold">
                <KeyRound className="h-4 w-4 text-[color:var(--neon-1)]" aria-hidden="true" />
                {resetToken ? "Choose a new password" : "Change password"}
              </div>
              {!resetToken ? (
                <label className="grid gap-1 text-xs font-bold uppercase text-[color:var(--muted)]">
                  Current password
                  <input
                    aria-label="Current password"
                    type="password"
                    autoComplete="current-password"
                    value={currentPassword}
                    onChange={(event) => setCurrentPassword(event.target.value)}
                    required
                    className="h-11 rounded-lg border border-[color:var(--line)] bg-white/[0.04] px-3 text-sm normal-case text-[color:var(--text)] outline-none focus:ring-2 focus:ring-[color:var(--neon-1)]"
                  />
                </label>
              ) : null}
              <label className="grid gap-1 text-xs font-bold uppercase text-[color:var(--muted)]">
                New password
                <input
                  aria-label="New password"
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  maxLength={128}
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  required
                  className="h-11 rounded-lg border border-[color:var(--line)] bg-white/[0.04] px-3 text-sm normal-case text-[color:var(--text)] outline-none focus:ring-2 focus:ring-[color:var(--neon-1)]"
                />
              </label>
              <button
                type="submit"
                disabled={busyAction !== null}
                className="h-11 rounded-lg bg-[color:var(--neon-1)] px-4 text-sm font-black text-[color:var(--base)] transition hover:brightness-110 disabled:opacity-50"
              >
                {resetToken ? "Set new password" : "Change password"}
              </button>
            </form>
          ) : (
            <form
              onSubmit={requestReset}
              className="grid gap-3 rounded-xl border border-[color:var(--line)] bg-white/[0.03] p-4"
            >
              <div className="font-extrabold">Forgot your password?</div>
              <label className="grid gap-1 text-xs font-bold uppercase text-[color:var(--muted)]">
                Email
                <input
                  aria-label="Email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  className="h-11 rounded-lg border border-[color:var(--line)] bg-white/[0.04] px-3 text-sm normal-case text-[color:var(--text)] outline-none focus:ring-2 focus:ring-[color:var(--neon-1)]"
                />
              </label>
              <button
                type="submit"
                disabled={busyAction !== null}
                className="h-11 rounded-lg bg-[color:var(--neon-1)] px-4 text-sm font-black text-[color:var(--base)] transition hover:brightness-110 disabled:opacity-50"
              >
                Send reset link
              </button>
            </form>
          )}

          {profile ? (
            <p className="text-sm text-[color:var(--muted)]">
              Stories are owned by your creator profile <strong>@{profile.username}</strong>.
            </p>
          ) : null}
          {notice ? <p className="text-sm font-bold text-emerald-300">{notice}</p> : null}
          {error ? <p role="alert" className="text-sm font-bold text-rose-300">{error}</p> : null}
        </section>
      </div>
    </main>
  );
}
