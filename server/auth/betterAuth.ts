import { createHash, createHmac, randomUUID } from "node:crypto";
import { isIP } from "node:net";
import type { Pool } from "pg";
import { APIError, betterAuth } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import { admin, username } from "better-auth/plugins";
import { defaultAc } from "better-auth/plugins/admin/access";
import { provisionCreatorProfile } from "./accounts";
import {
  AuthAbuseLimitError,
  PersistentAuthAbuseLimiter
} from "./abuseLimiter";
import type { AuthRuntimeConfig } from "./config";
import {
  queueTransactionalEmail,
  type AuthEmailKind,
  type TransactionalEmailSender
} from "./email";

const COMMON_PASSWORDS = new Set([
  "0000",
  "123456789012",
  "letmeinletmein",
  "password",
  "password123",
  "qwertyqwerty"
]);

const adminRole = defaultAc.newRole({
  session: ["revoke"],
  user: []
});
const userRole = defaultAc.newRole({ session: [], user: [] });

const FORBIDDEN_ADMIN_PATHS = new Set([
  "/admin/create-user",
  "/admin/impersonate-user",
  "/admin/remove-user",
  "/admin/set-role",
  "/admin/set-user-password",
  "/admin/update-user"
]);

function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}

function safeIdentifierHash(secret: string, value: string) {
  return createHmac("sha256", secret)
    .update(value.trim().toLowerCase())
    .digest("hex");
}

function emailIdempotencyKey(kind: AuthEmailKind, userId: string, token: string) {
  const digest = createHash("sha256")
    .update(`${kind}:${userId}:${token}`)
    .digest("hex");
  return `chatsim-${kind}-${digest}`;
}

function queueLinkEmail(
  sender: TransactionalEmailSender,
  input: {
    kind: "password-reset" | "verification";
    token: string;
    to: string;
    url: string;
    userId: string;
  }
) {
  const verification = input.kind === "verification";
  const heading = verification
    ? "Verify your Chatsim account"
    : "Reset your Chatsim password";
  const instruction = verification
    ? "Open this link to verify your email:"
    : "Open this link to choose a new password:";

  queueTransactionalEmail(sender, {
    html: `<h1>${heading}</h1><p>${instruction}</p><p><a href="${input.url}">${heading}</a></p>`,
    idempotencyKey: emailIdempotencyKey(
      input.kind,
      input.userId,
      input.token
    ),
    kind: input.kind,
    subject: heading,
    text: `${heading}\n\n${instruction}\n${input.url}`,
    to: input.to
  });
}

async function writeAudit(
  pool: Pool,
  input: {
    action:
      | "email_verified"
      | "password_reset"
      | "registered";
    identifierHash?: string;
    targetAuthUserId: string;
  }
) {
  await pool.query(
    `INSERT INTO auth_account_action_audit (
       id, target_auth_user_id, target_identifier_hash, action
     ) VALUES ($1, $2, $3, $4)`,
    [
      randomUUID(),
      input.targetAuthUserId,
      input.identifierHash ?? null,
      input.action
    ]
  );
}

function validatePassword(password: unknown) {
  if (
    typeof password === "string" &&
    COMMON_PASSWORDS.has(password.toLowerCase())
  ) {
    throw new APIError("BAD_REQUEST", {
      code: "COMMON_PASSWORD",
      message: "Choose a less common password."
    });
  }
}

export function buildChatsimAuth({
  config,
  pool,
  sender
}: {
  config: AuthRuntimeConfig;
  pool: Pool;
  sender: TransactionalEmailSender;
}) {
  const isProduction = config.environment === "production";

  return betterAuth({
    appName: "Chatsim",
    database: pool,
    secret: config.secret,
    baseURL: config.baseUrl,
    trustedOrigins: config.trustedOrigins,
    user: {
      modelName: "auth_user",
      changeEmail: { enabled: false },
      deleteUser: { enabled: false },
      additionalFields: {
        approvalStatus: {
          type: "string",
          required: true,
          defaultValue:
            config.registrationMode === "open" ? "approved" : "pending",
          input: false
        }
      }
    },
    session: {
      modelName: "auth_session",
      expiresIn: 30 * 24 * 60 * 60,
      updateAge: 24 * 60 * 60,
      cookieCache: { enabled: false }
    },
    account: { modelName: "auth_account" },
    verification: { modelName: "auth_verification" },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: false,
      sendVerificationEmail: async ({ token, url, user }) => {
        queueLinkEmail(sender, {
          kind: "verification",
          token,
          to: user.email,
          url,
          userId: user.id
        });
      },
      afterEmailVerification: async (user) => {
        await writeAudit(pool, {
          action: "email_verified",
          identifierHash: safeIdentifierHash(config.secret, user.email),
          targetAuthUserId: user.id
        });
        await provisionCreatorProfile(pool, user.id);
      }
    },
    emailAndPassword: {
      enabled: true,
      autoSignIn: false,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      requireEmailVerification: true,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ token, url, user }) => {
        queueLinkEmail(sender, {
          kind: "password-reset",
          token,
          to: user.email,
          url,
          userId: user.id
        });
      },
      onPasswordReset: async ({ user }) => {
        await writeAudit(pool, {
          action: "password_reset",
          identifierHash: safeIdentifierHash(config.secret, user.email),
          targetAuthUserId: user.id
        });
      }
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            const rawUsername = (user as Record<string, unknown>).username;

            if (typeof rawUsername !== "string") {
              throw new APIError("BAD_REQUEST", {
                code: "USERNAME_REQUIRED",
                message: "Username is required."
              });
            }

            const normalizedUsername = normalizeUsername(rawUsername);
            return {
              data: {
                ...user,
                name: normalizedUsername,
                username: normalizedUsername,
                approvalStatus:
                  config.registrationMode === "open" ? "approved" : "pending"
              }
            };
          },
          after: async (user) => {
            await writeAudit(pool, {
              action: "registered",
              identifierHash: safeIdentifierHash(config.secret, user.email),
              targetAuthUserId: user.id
            });
          }
        }
      },
      session: {
        create: {
          before: async (session) => {
            const result = await pool.query<{
              approvalStatus: string;
              banned: boolean;
              emailVerified: boolean;
              profile_id: string | null;
            }>(
              `SELECT i."approvalStatus", i.banned, i."emailVerified",
                      p.id AS profile_id
               FROM auth_user i
               LEFT JOIN users p ON p.auth_user_id = i.id
               WHERE i.id = $1`,
              [session.userId]
            );
            const account = result.rows[0];

            if (!account?.emailVerified) {
              throw new APIError("FORBIDDEN", {
                code: "EMAIL_NOT_VERIFIED",
                message: "Verify your email before signing in."
              });
            }

            if (account.approvalStatus === "pending") {
              throw new APIError("FORBIDDEN", {
                code: "ACCOUNT_PENDING",
                message: "This account is waiting for approval."
              });
            }

            if (
              account.approvalStatus === "approved" &&
              !account.banned &&
              !account.profile_id
            ) {
              const profile = await provisionCreatorProfile(
                pool,
                session.userId
              );
              account.profile_id = profile?.id ?? null;
            }

            if (
              account.approvalStatus !== "approved" ||
              account.banned ||
              !account.profile_id
            ) {
              throw new APIError("FORBIDDEN", {
                code: account.banned ? "ACCOUNT_DISABLED" : "ACCOUNT_REJECTED",
                message: "This account cannot sign in."
              });
            }

            return { data: session };
          }
        }
      }
    },
    hooks: {
      before: createAuthMiddleware(async (context) => {
        if (FORBIDDEN_ADMIN_PATHS.has(context.path)) {
          throw new APIError("FORBIDDEN", {
            code: "ADMIN_ACTION_NOT_ALLOWED",
            message: "This admin action is not available."
          });
        }

        if (
          context.path === "/delete-user" ||
          context.path === "/change-email" ||
          context.path === "/update-user"
        ) {
          throw new APIError("FORBIDDEN", {
            code: "IDENTITY_CHANGE_NOT_AVAILABLE",
            message: "Identity changes are not available."
          });
        }

        if (context.path === "/sign-up/email") {
          if (config.registrationMode === "closed") {
            throw new APIError("FORBIDDEN", {
              code: "REGISTRATION_CLOSED",
              message: "Account creation is currently closed."
            });
          }

          const rawUsername = String(
            (context.body as { username?: unknown } | undefined)?.username ?? ""
          );
          const normalizedUsername = normalizeUsername(rawUsername);
          const existingProfile = await pool.query(
            "SELECT 1 FROM users WHERE username = $1",
            [normalizedUsername]
          );

          if (existingProfile.rowCount) {
            throw new APIError("BAD_REQUEST", {
              code: "USERNAME_IS_ALREADY_TAKEN",
              message: "Username is already taken."
            });
          }
        }

        const body = context.body as
          | { newPassword?: unknown; password?: unknown }
          | undefined;

        if (
          context.path === "/sign-up/email" ||
          context.path === "/change-password" ||
          context.path === "/reset-password"
        ) {
          validatePassword(body?.password ?? body?.newPassword);
        }
      })
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      modelName: "auth_rate_limit",
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/email": { window: 15 * 60, max: 5 },
        "/sign-in/username": { window: 15 * 60, max: 5 },
        "/sign-up/email": { window: 60 * 60, max: 3 },
        "/send-verification-email": { window: 60 * 60, max: 3 },
        "/request-password-reset": { window: 60 * 60, max: 3 }
      }
    },
    advanced: {
      // Better Auth otherwise prepends `__Secure-` to custom names. The
      // session cookie already uses the stricter `__Host-` prefix and gets
      // its Secure attribute explicitly below.
      useSecureCookies: false,
      trustedProxyHeaders: false,
      ipAddress: { ipAddressHeaders: ["x-real-ip"] },
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: isProduction
      },
      cookies: {
        session_token: {
          name: isProduction
            ? "__Host-chatsim_session"
            : "chatsim_session"
        }
      }
    },
    plugins: [
      username({
        displayUsername: false,
        immutableUsername: true,
        minUsernameLength: 3,
        maxUsernameLength: 32,
        usernameNormalization: normalizeUsername,
        usernameValidator: (value) => /^[a-zA-Z0-9_-]{3,32}$/.test(value)
      }),
      admin({
        defaultRole: "user",
        adminRoles: ["admin"],
        roles: { admin: adminRole, user: userRole }
      })
    ]
  });
}

export type ChatsimAuth = ReturnType<typeof buildChatsimAuth>;

function sanitizedClientIp(request: Request) {
  const candidate = request.headers.get("x-real-ip")?.trim() ?? "";
  return isIP(candidate) ? candidate : "unknown";
}

function authPath(request: Request) {
  const pathname = new URL(request.url).pathname;
  return pathname.startsWith("/api/auth")
    ? pathname.slice("/api/auth".length) || "/"
    : pathname;
}

async function requestBody(request: Request) {
  if (request.method === "GET" || request.method === "HEAD") {
    return {} as Record<string, unknown>;
  }

  return request
    .clone()
    .json()
    .catch(() => ({})) as Promise<Record<string, unknown>>;
}

function rateLimitedResponse(error: AuthAbuseLimitError) {
  return Response.json(
    {
      code: "TOO_MANY_REQUESTS",
      error: "Too many authentication attempts. Try again later."
    },
    {
      headers: { "Retry-After": String(error.retryAfterSeconds) },
      status: 429
    }
  );
}

export function createChatsimAuthWebHandler({
  auth,
  config,
  pool
}: {
  auth: ChatsimAuth;
  config: AuthRuntimeConfig;
  pool: Pool;
}) {
  const limiter = new PersistentAuthAbuseLimiter(pool, {
    secret: config.secret
  });

  return async (request: Request) => {
    const path = authPath(request);
    const body = await requestBody(request);
    const clientIp = sanitizedClientIp(request);
    const headers = new Headers(request.headers);

    if (clientIp === "unknown") {
      headers.delete("x-real-ip");
    } else {
      headers.set("x-real-ip", clientIp);
    }

    const sanitizedRequest = new Request(request, { headers });

    try {
      if (path === "/sign-up/email") {
        await limiter.consume("sign_up_ip", clientIp, 3, 60 * 60);
      }

      if (
        path === "/send-verification-email" ||
        path === "/request-password-reset"
      ) {
        const identifier = String(body.email ?? "");
        const prefix =
          path === "/send-verification-email" ? "verification" : "reset";
        await limiter.consume(`${prefix}_identifier`, identifier, 3, 60 * 60);
        await limiter.consume(`${prefix}_ip`, clientIp, 3, 60 * 60);
      }

      const isEmailSignIn = path === "/sign-in/email";
      const isUsernameSignIn = path === "/sign-in/username";

      if (!isEmailSignIn && !isUsernameSignIn) {
        return auth.handler(sanitizedRequest);
      }

      const identifier = String(
        isEmailSignIn ? body.email ?? "" : body.username ?? ""
      );
      await limiter.check(
        "sign_in_identifier",
        identifier,
        5,
        15 * 60
      );
      await limiter.check("sign_in_ip", clientIp, 5, 15 * 60);
      const response = await auth.handler(sanitizedRequest);

      if (response.ok) {
        await limiter.reset("sign_in_identifier", identifier);
      } else {
        await limiter.record("sign_in_identifier", identifier, 15 * 60);
        await limiter.record("sign_in_ip", clientIp, 15 * 60);
      }

      return response;
    } catch (error) {
      if (error instanceof AuthAbuseLimitError) {
        return rateLimitedResponse(error);
      }

      throw error;
    }
  };
}
