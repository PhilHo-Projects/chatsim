import { usernameClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  fetchOptions: {
    customFetchImpl: (...args: Parameters<typeof fetch>) => fetch(...args)
  },
  plugins: [usernameClient({ displayUsername: false })]
});

type AuthResult = Promise<{
  data: unknown;
  error: { code?: string; message?: string } | null;
}>;

type SignInClient = {
  signIn: {
    email(input: { email: string; password: string }): AuthResult;
    username(input: { password: string; username: string }): AuthResult;
  };
};

export function authErrorMessage(code: string | undefined, fallback: string) {
  switch (code) {
    case "ACCOUNT_PENDING":
      return "This account is waiting for approval.";
    case "ACCOUNT_REJECTED":
      return "This account cannot sign in.";
    case "ACCOUNT_DISABLED":
      return "This account has been disabled.";
    case "EMAIL_NOT_VERIFIED":
      return "Verify your email before signing in.";
    case "INVALID_EMAIL_OR_PASSWORD":
    case "INVALID_USERNAME_OR_PASSWORD":
      return "That username or email and password do not match.";
    case "REGISTRATION_CLOSED":
      return "Account creation is currently closed.";
    case "COMMON_PASSWORD":
      return "Choose a less common password.";
    case "PASSWORD_TOO_SHORT":
      return "Passwords must be at least 12 characters.";
    case "TOO_MANY_REQUESTS":
      return "Too many attempts. Wait a few minutes and try again.";
    case "USERNAME_IS_ALREADY_TAKEN":
    case "USERNAME_IS_ALREADY_IN_USE":
      return "That username is already taken.";
    default:
      return fallback;
  }
}

export async function signInWithIdentifier(
  client: SignInClient,
  input: { identifier: string; password: string }
) {
  const identifier = input.identifier.trim().toLowerCase();
  const result = identifier.includes("@")
    ? await client.signIn.email({ email: identifier, password: input.password })
    : await client.signIn.username({
        password: input.password,
        username: identifier
      });

  if (result.error) {
    throw new Error(
      authErrorMessage(
        result.error.code,
        "Could not sign in with those credentials."
      )
    );
  }
}
