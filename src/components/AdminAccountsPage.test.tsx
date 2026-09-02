import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import { AdminAccountsPage } from "./AdminAccountsPage";

const fetchAdminAccounts = vi.fn();
const performAdminAccountAction = vi.fn();

vi.mock("../api/storyApi", async (importOriginal) => {
  const original = await importOriginal<typeof import("../api/storyApi")>();
  return {
    ...original,
    fetchAdminAccounts: (...args: unknown[]) => fetchAdminAccounts(...args),
    performAdminAccountAction: (...args: unknown[]) =>
      performAdminAccountAction(...args)
  };
});

describe("AdminAccountsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchAdminAccounts.mockResolvedValue({
      accounts: [
        {
          approvalStatus: "pending",
          createdAt: "2026-09-01T12:00:00.000Z",
          disabled: false,
          email: "maya@example.com",
          emailVerified: true,
          id: "auth-maya",
          profile: null,
          role: "user",
          sessionCount: 0,
          username: "maya"
        }
      ]
    });
  });

  it("lists accounts and refreshes after approving one", async () => {
    performAdminAccountAction.mockResolvedValue({ account: {} });
    render(<AdminAccountsPage onBack={vi.fn()} />);

    expect(await screen.findByText("maya@example.com")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /approve maya/i }));

    await waitFor(() =>
      expect(performAdminAccountAction).toHaveBeenCalledWith(
        "auth-maya",
        "approve"
      )
    );
    expect(fetchAdminAccounts).toHaveBeenCalledTimes(2);
  });

  it("shows a useful load error", async () => {
    fetchAdminAccounts.mockRejectedValue(new Error("No access."));
    render(<AdminAccountsPage onBack={vi.fn()} />);

    expect(await screen.findByText("No access.")).toBeInTheDocument();
  });
});
