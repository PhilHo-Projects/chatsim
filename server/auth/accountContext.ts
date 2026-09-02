import type { Pool } from "pg";
import { getCreatorProfile, type CreatorProfile } from "./accounts";
import type { ChatsimAuth } from "./betterAuth";
import type { AuthRegistrationMode, AuthRuntimeConfig } from "./config";

export type AccountRole = "admin" | "user";
export type ApprovalStatus = "approved" | "pending" | "rejected";

export type CurrentAccount = {
  session: { expiresAt: string } | null;
  account: {
    approvalStatus: ApprovalStatus;
    disabled: boolean;
    email: string;
    emailVerified: boolean;
    id: string;
    role: AccountRole;
    username: string;
  } | null;
  profile: CreatorProfile | null;
  registrationMode: AuthRegistrationMode;
};

export type CurrentAccountResolution = {
  currentAccount: CurrentAccount;
  headers: Headers;
};

export type AuthenticatedActor = {
  authUserId: string;
  profileId: string;
  role: AccountRole;
};

type IdentityRow = {
  approvalStatus: ApprovalStatus;
  banned: boolean;
  email: string;
  emailVerified: boolean;
  id: string;
  role: AccountRole;
  username: string;
};

type CurrentAccountInput = {
  auth: ChatsimAuth;
  config: AuthRuntimeConfig;
  disableRefresh?: boolean;
  headers: Headers;
  pool: Pool;
};

export async function getCurrentAccountWithHeaders({
  auth,
  config,
  disableRefresh,
  headers,
  pool
}: CurrentAccountInput): Promise<CurrentAccountResolution> {
  const authSessionResult = await auth.api.getSession({
    headers,
    query:
      disableRefresh === undefined ? undefined : { disableRefresh },
    returnHeaders: true
  });
  const authSession = authSessionResult.response;

  if (!authSession) {
    return {
      currentAccount: {
        account: null,
        profile: null,
        registrationMode: config.registrationMode,
        session: null
      },
      headers: authSessionResult.headers
    };
  }

  const identityResult = await pool.query<IdentityRow>(
    `SELECT id, email, "emailVerified", username, role, banned,
            "approvalStatus"
     FROM auth_user WHERE id = $1`,
    [authSession.user.id]
  );
  const identity = identityResult.rows[0];

  if (!identity) {
    return {
      currentAccount: {
        account: null,
        profile: null,
        registrationMode: config.registrationMode,
        session: null
      },
      headers: authSessionResult.headers
    };
  }

  return {
    currentAccount: {
      account: {
        approvalStatus: identity.approvalStatus,
        disabled: identity.banned,
        email: identity.email,
        emailVerified: identity.emailVerified,
        id: identity.id,
        role: identity.role,
        username: identity.username
      },
      profile: await getCreatorProfile(pool, identity.id),
      registrationMode: config.registrationMode,
      session: {
        expiresAt: new Date(authSession.session.expiresAt).toISOString()
      }
    },
    headers: authSessionResult.headers
  };
}

export async function getCurrentAccount(
  input: CurrentAccountInput
): Promise<CurrentAccount> {
  return (await getCurrentAccountWithHeaders(input)).currentAccount;
}

export function resolveAuthenticatedActor(
  current: CurrentAccount
): AuthenticatedActor | null {
  if (
    !current.account ||
    !current.profile ||
    !current.account.emailVerified ||
    current.account.approvalStatus !== "approved" ||
    current.account.disabled
  ) {
    return null;
  }

  return {
    authUserId: current.account.id,
    profileId: current.profile.id,
    role: current.account.role
  };
}
