import { render, screen, within } from "@testing-library/react";
import { vi } from "vitest";
import { AccountPanel } from "./AccountPanel";

const baseProps = {
  accountError: "",
  authMode: "login" as const,
  email: "",
  isBusy: false,
  onAuthModeChange: vi.fn(),
  onCreateStory: vi.fn(),
  onEmailChange: vi.fn(),
  onLogout: vi.fn(),
  onPasswordChange: vi.fn(),
  onSubmit: vi.fn(),
  onUsernameChange: vi.fn(),
  password: "",
  session: null,
  username: ""
};

describe("AccountPanel registration modes", () => {
  it("hides account creation in closed mode", () => {
    render(<AccountPanel {...baseProps} registrationMode="closed" />);
    const panel = screen.getByRole("dialog", { name: "Account panel" });

    expect(within(panel).queryByRole("button", { name: "Create" })).not.toBeInTheDocument();
    expect(within(panel).getByText("Username or email")).toBeInTheDocument();
  });

  it("shows email signup in approval mode", () => {
    render(
      <AccountPanel
        {...baseProps}
        authMode="register"
        registrationMode="approval"
      />
    );
    const panel = screen.getByRole("dialog", { name: "Account panel" });

    expect(within(panel).getByLabelText("Email")).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "Create account" })).toBeInTheDocument();
  });
});
