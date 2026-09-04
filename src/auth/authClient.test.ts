import { describe, expect, it, vi } from "vitest";
import { signInWithIdentifier } from "./authClient";

describe("Chatsim auth client", () => {
  it("routes email identifiers to Better Auth email sign-in", async () => {
    const email = vi.fn().mockResolvedValue({ data: {}, error: null });
    const username = vi.fn();

    await signInWithIdentifier(
      { signIn: { email, username } },
      { identifier: " Maya@Example.com ", password: "secret-password-2026" }
    );

    expect(email).toHaveBeenCalledWith({
      email: "maya@example.com",
      password: "secret-password-2026"
    });
    expect(username).not.toHaveBeenCalled();
  });

  it("routes handles to the username plugin", async () => {
    const email = vi.fn();
    const username = vi.fn().mockResolvedValue({ data: {}, error: null });

    await signInWithIdentifier(
      { signIn: { email, username } },
      { identifier: " Maya-Story ", password: "secret-password-2026" }
    );

    expect(username).toHaveBeenCalledWith({
      password: "secret-password-2026",
      username: "maya-story"
    });
    expect(email).not.toHaveBeenCalled();
  });

  it("surfaces Better Auth errors without exposing provider internals", async () => {
    const email = vi.fn();
    const username = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "ACCOUNT_PENDING", message: "internal message" }
    });

    await expect(
      signInWithIdentifier(
        { signIn: { email, username } },
        { identifier: "pending", password: "secret-password-2026" }
      )
    ).rejects.toThrow("This account is waiting for approval.");
  });
});
