import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import type { CurrentAccount } from "../api/storyApi";
import { AccountPage } from "./AccountPage";

const requestVerificationEmail = vi.fn();
const requestPasswordReset = vi.fn();
const resetPassword = vi.fn();
const changePassword = vi.fn();

vi.mock("../api/storyApi", async (importOriginal) => {
  const original = await importOriginal<typeof import("../api/storyApi")>();
  return {
    ...original,
    changePassword: (...args: unknown[]) => changePassword(...args),
    requestPasswordReset: (...args: unknown[]) => requestPasswordReset(...args),
    requestVerificationEmail: (...args: unknown[]) =>
      requestVerificationEmail(...args),
    resetPassword: (...args: unknown[]) => resetPassword(...args)
  };
});

const pendingAccount: CurrentAccount = {
  account: {
    approvalStatus: "pending",
    disabled: false,
    email: "maya@example.com",
    emailVerified: true,
    id: "auth-maya",
    role: "user",
    username: "maya"
  },
  profile: null,
  registrationMode: "approval",
  session: null
};

describe("AccountPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("explains an approval-pending account and can resend verification", async () => {
    requestVerificationEmail.mockResolvedValue(undefined);
    render(<AccountPage currentAccount={pendingAccount} onBack={vi.fn()} />);

    expect(screen.getByText(/waiting for approval/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /resend verification/i }));

    await waitFor(() =>
      expect(requestVerificationEmail).toHaveBeenCalledWith("maya@example.com")
    );
    expect(screen.getByText(/if that address can receive mail/i)).toBeInTheDocument();
  });

  it("lets a signed-in account change its password", async () => {
    changePassword.mockResolvedValue(undefined);
    render(
      <AccountPage
        currentAccount={{
          ...pendingAccount,
          account: { ...pendingAccount.account!, approvalStatus: "approved" },
          profile: {
            accentColor: "#22d3ee",
            bio: null,
            displayName: "Maya",
            id: "user-maya",
            username: "maya"
          },
          session: { expiresAt: "2026-09-30T00:00:00.000Z" }
        }}
        onBack={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText("Current password"), {
      target: { value: "old-password-123" }
    });
    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "new-password-456" }
    });
    fireEvent.click(screen.getByRole("button", { name: /change password/i }));

    await waitFor(() =>
      expect(changePassword).toHaveBeenCalledWith(
        "old-password-123",
        "new-password-456"
      )
    );
    expect(screen.getByText(/password updated/i)).toBeInTheDocument();
  });

  it("shows the reset form when a recovery token is present", async () => {
    resetPassword.mockResolvedValue(undefined);
    render(
      <AccountPage
        currentAccount={{
          account: null,
          profile: null,
          registrationMode: "open",
          session: null
        }}
        onBack={vi.fn()}
        resetToken="reset-token"
      />
    );

    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "replacement-password-123" }
    });
    fireEvent.click(screen.getByRole("button", { name: /set new password/i }));

    await waitFor(() =>
      expect(resetPassword).toHaveBeenCalledWith(
        "reset-token",
        "replacement-password-123"
      )
    );
  });

  it("confirms a verification redirect without assuming approval", () => {
    render(
      <AccountPage
        currentAccount={{
          account: null,
          profile: null,
          registrationMode: "approval",
          session: null
        }}
        onBack={vi.fn()}
        verificationComplete
      />
    );

    expect(
      screen.getByText(/email verified.*approval is required/i)
    ).toBeInTheDocument();
  });

  it.each([
    [
      { disabled: true },
      "This account is disabled."
    ],
    [
      { approvalStatus: "rejected" as const },
      "This account request was not approved."
    ]
  ])("shows blocked account status without offering a session", (patch, message) => {
    render(
      <AccountPage
        currentAccount={{
          ...pendingAccount,
          account: { ...pendingAccount.account!, ...patch }
        }}
        onBack={vi.fn()}
      />
    );

    expect(screen.getByText(message)).toBeInTheDocument();
  });
});
