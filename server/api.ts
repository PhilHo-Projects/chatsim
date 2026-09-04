import type {
  IncomingMessage,
  OutgoingHttpHeaders,
  ServerResponse
} from "node:http";
import { isIP } from "node:net";
import { fromNodeHeaders } from "better-auth/node";
import type { Pool } from "pg";
import {
  resolveAuthenticatedActor,
  type AuthenticatedActor,
  type CurrentAccountResolution
} from "./auth/accountContext";
import {
  AccountLifecycleError,
  approveAccount,
  listAccounts,
  rejectAccount,
  revokeAccountSessions,
  setAccountDisabled
} from "./auth/accounts";
import type { AuthRuntimeConfig } from "./auth/config";
import {
  queueApprovalEmail,
  type TransactionalEmailSender
} from "./auth/email";
import { HttpError } from "./httpError";
import {
  createMediaServiceFromEnvironment,
  type MediaService
} from "./mediaService";
import { InMemoryRateLimiter } from "./rateLimiter";
import {
  StoryStore,
  type SessionPayload,
  type StartedSession,
  type StoryPatch
} from "./storyStore";
import {
  loginSchema,
  parseInput,
  registrationSchema,
  storyPatchSchema,
  uploadRequestSchema,
  userPatchSchema
} from "./validation";

const SESSION_COOKIE = "chatsim_session";
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const MAX_JSON_BODY_BYTES = 1024 * 1024;
const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8"
};

type ApiHandlerOptions = {
  authConfig?: AuthRuntimeConfig;
  currentAccount?: (
    headers: Headers,
    options?: { disableRefresh?: boolean }
  ) => Promise<CurrentAccountResolution>;
  healthCheck?: () => Promise<{
    auth: "ok";
    database: "ok" | "unavailable";
  }>;
  media?: Promise<MediaService> | MediaService | null;
  pool?: Pool;
  sender?: TransactionalEmailSender;
  store?: Promise<StoryStore> | StoryStore;
  trustProxy?: boolean;
};

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const REGISTRATION_WINDOW_MS = 60 * 60 * 1000;
const UPLOAD_WINDOW_MS = 60 * 60 * 1000;

function parseCookies(header: string | undefined) {
  const cookies: Record<string, string> = {};

  for (const cookie of (header ?? "").split(";")) {
    const trimmed = cookie.trim();

    if (!trimmed) {
      continue;
    }

    const [rawName, ...valueParts] = trimmed.split("=");

    try {
      cookies[decodeURIComponent(rawName)] = decodeURIComponent(
        valueParts.join("=")
      );
    } catch {
      continue;
    }
  }

  return cookies;
}

function cookieSecurityAttribute(
  secure = process.env.NODE_ENV === "production"
) {
  return secure ? "; Secure" : "";
}

function sessionCookie(token: string) {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESSION_MAX_AGE_SECONDS}${cookieSecurityAttribute()}`;
}

function clearSessionCookie(
  secure = process.env.NODE_ENV === "production"
) {
  return `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${cookieSecurityAttribute(secure)}`;
}

function publicSession(session: StartedSession): SessionPayload {
  return {
    expiresAt: session.expiresAt,
    user: session.user
  };
}

function sendJson(
  response: ServerResponse,
  statusCode: number,
  payload: unknown,
  extraHeaders: OutgoingHttpHeaders = {}
) {
  response.writeHead(statusCode, {
    ...JSON_HEADERS,
    ...extraHeaders
  });
  response.end(JSON.stringify(payload));
}

function forwardedAuthHeaders(headers: Headers): OutgoingHttpHeaders {
  const outgoing: OutgoingHttpHeaders = {};

  headers.forEach((value, name) => {
    if (name.toLowerCase() !== "set-cookie") {
      outgoing[name] = value;
    }
  });

  const setCookies = (
    headers as Headers & { getSetCookie?: () => string[] }
  ).getSetCookie?.() ?? [];

  if (setCookies.length > 0) {
    outgoing["Set-Cookie"] = setCookies;
  } else {
    const setCookie = headers.get("set-cookie");

    if (setCookie) {
      outgoing["Set-Cookie"] = setCookie;
    }
  }

  return outgoing;
}

function appendSetCookie(headers: OutgoingHttpHeaders, cookie: string) {
  const existing = headers["Set-Cookie"] ?? headers["set-cookie"];
  delete headers["set-cookie"];

  headers["Set-Cookie"] = Array.isArray(existing)
    ? [...existing, cookie]
    : existing
      ? [String(existing), cookie]
      : [cookie];
}

async function readJsonBody(request: IncomingMessage) {
  const mediaType = request.headers["content-type"]
    ?.split(";")[0]
    ?.trim()
    .toLowerCase();

  const isJson =
    mediaType === "application/json" ||
    Boolean(
      mediaType?.startsWith("application/") && mediaType.endsWith("+json")
    );

  if (!isJson) {
    throw new HttpError(
      "Content-Type must be application/json.",
      415,
      "UNSUPPORTED_MEDIA_TYPE"
    );
  }

  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of request) {
    const buffer = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
    size += buffer.byteLength;

    if (size > MAX_JSON_BODY_BYTES) {
      throw new HttpError(
        "JSON request body is too large.",
        413,
        "PAYLOAD_TOO_LARGE"
      );
    }

    chunks.push(buffer);
  }

  if (chunks.length === 0) {
    return {};
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<
      string,
      unknown
    >;
  } catch {
    throw new HttpError("Request body must be valid JSON.", 400, "BAD_REQUEST");
  }
}

function getSessionToken(request: IncomingMessage) {
  return parseCookies(request.headers.cookie)[SESSION_COOKIE];
}

function normalizeUsername(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "");
}

function envFlag(value: string | undefined) {
  return value === "1" || value?.toLowerCase() === "true";
}

function getClientIp(
  request: IncomingMessage,
  trustProxy: boolean,
  trustSanitizedRealIp = false
) {
  const remoteAddress = request.socket.remoteAddress ?? "unknown";

  if (trustSanitizedRealIp && isPrivateProxyAddress(remoteAddress)) {
    const realIp = request.headers["x-real-ip"];
    const candidate = Array.isArray(realIp) ? "" : realIp?.trim();

    if (candidate && isIP(candidate)) {
      return candidate;
    }

    return isIP(remoteAddress) ? remoteAddress : "0.0.0.0";
  }

  if (trustProxy && isPrivateProxyAddress(remoteAddress)) {
    const forwardedFor = request.headers["x-forwarded-for"];
    const addresses = (
      Array.isArray(forwardedFor) ? forwardedFor.join(",") : forwardedFor ?? ""
    )
      .split(",")
      .map((address) => address.trim())
      .filter(Boolean);
    const nearestAddress = addresses.at(-1);

    if (nearestAddress && isIP(nearestAddress)) {
      return nearestAddress;
    }
  }

  return isIP(remoteAddress) ? remoteAddress : "0.0.0.0";
}

function isPrivateProxyAddress(address: string) {
  const normalized = address.startsWith("::ffff:")
    ? address.slice("::ffff:".length)
    : address;

  if (normalized === "::1" || normalized === "127.0.0.1") {
    return true;
  }

  if (isIP(normalized) === 4) {
    const [first, second] = normalized
      .split(".")
      .map((part) => Number.parseInt(part, 10));
    return (
      first === 10 ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168) ||
      first === 127
    );
  }

  return /^(fc|fd|fe8|fe9|fea|feb)/i.test(normalized);
}

function throwRateLimit(retryAfterSeconds: number) {
  throw new HttpError(
    "Too many attempts. Try again later.",
    429,
    "RATE_LIMITED",
    retryAfterSeconds
  );
}

export function createApiHandler(options: ApiHandlerOptions = {}) {
  let defaultStore: Promise<StoryStore> | undefined;
  let defaultMedia: Promise<MediaService> | undefined;
  const trustProxy = options.trustProxy ?? envFlag(process.env.TRUST_PROXY);
  const loginIpLimiter = new InMemoryRateLimiter({
    limit: 10,
    windowMs: LOGIN_WINDOW_MS
  });
  const loginUsernameLimiter = new InMemoryRateLimiter({
    limit: 5,
    windowMs: LOGIN_WINDOW_MS
  });
  const registrationIpLimiter = new InMemoryRateLimiter({
    limit: 5,
    windowMs: REGISTRATION_WINDOW_MS
  });
  const uploadUserLimiter = new InMemoryRateLimiter({
    limit: 30,
    windowMs: UPLOAD_WINDOW_MS
  });
  const getStore = () => {
    if (options.store) {
      return Promise.resolve(options.store);
    }

    defaultStore ??= StoryStore.open().catch((error: unknown) => {
      defaultStore = undefined;
      throw error;
    });
    return defaultStore;
  };
  const getMedia = () => {
    if (options.media === null) {
      throw new HttpError(
        "Image uploads are temporarily unavailable.",
        503,
        "SERVICE_UNAVAILABLE"
      );
    }

    if (options.media) {
      return Promise.resolve(options.media);
    }

    defaultMedia ??= Promise.resolve()
      .then(() => createMediaServiceFromEnvironment())
      .catch((error: unknown) => {
        defaultMedia = undefined;
        console.error("Media service unavailable", error);
        throw new HttpError(
          "Image uploads are temporarily unavailable.",
          503,
          "SERVICE_UNAVAILABLE"
        );
      });
    return defaultMedia;
  };
  const getCurrentAccount = (
    request: IncomingMessage,
    accountOptions?: { disableRefresh?: boolean }
  ) => options.currentAccount?.(
    fromNodeHeaders(request.headers),
    accountOptions
  );
  const getOptionalActor = async (
    request: IncomingMessage
  ): Promise<AuthenticatedActor | string | null> => {
    if (options.currentAccount) {
      const resolved = await getCurrentAccount(request, {
        disableRefresh: true
      });
      return resolved
        ? resolveAuthenticatedActor(resolved.currentAccount)
        : null;
    }

    const session = await (await getStore()).getSession(getSessionToken(request));
    return session?.user.id ?? null;
  };
  const requireActor = async (
    request: IncomingMessage,
    message: string
  ): Promise<AuthenticatedActor | string> => {
    const actor = await getOptionalActor(request);

    if (!actor) {
      throw new HttpError(message, 401, "UNAUTHENTICATED");
    }

    return actor;
  };
  const requireAdminActor = async (request: IncomingMessage) => {
    const actor = await requireActor(request, "Sign in as an admin.");

    if (typeof actor === "string" || actor.role !== "admin") {
      throw new HttpError("Admin access is required.", 403, "FORBIDDEN");
    }

    return actor;
  };
  const assertTrustedOrigin = (request: IncomingMessage) => {
    if (!options.authConfig || request.method === "GET" || request.method === "HEAD") {
      return;
    }

    const origin = request.headers.origin;

    if (!origin || !options.authConfig.trustedOrigins.includes(origin)) {
      throw new HttpError("Request origin is not allowed.", 403, "FORBIDDEN");
    }
  };

  return async function handleApiRequest(
    request: IncomingMessage,
    response: ServerResponse
  ) {
    const url = new URL(request.url ?? "/", "http://localhost");

    if (!url.pathname.startsWith("/api")) {
      return false;
    }

    try {
      if (request.method === "GET" && url.pathname === "/api/health") {
        let healthy = false;
        let authHealthy = Boolean(options.healthCheck);

        try {
          if (options.healthCheck) {
            const health = await options.healthCheck();
            healthy = health.database === "ok";
            authHealthy = health.auth === "ok";
          } else {
            healthy = await (await getStore()).healthCheck();
          }
        } catch {
          healthy = false;
          authHealthy = false;
        }

        sendJson(response, healthy ? 200 : 503, {
          status: healthy ? "ok" : "unavailable",
          database: healthy ? "ok" : "unavailable",
          ...(options.healthCheck
            ? { auth: authHealthy ? "ok" : "unavailable" }
            : {}),
          sourceCommit: process.env.SOURCE_COMMIT?.trim() || null
        });
        return true;
      }

      const store = await getStore();

      if (options.currentAccount) {
        assertTrustedOrigin(request);
      }

      if (
        options.currentAccount &&
        request.method === "GET" &&
        url.pathname === "/api/me"
      ) {
        const resolved = await getCurrentAccount(request);
        const responseHeaders = forwardedAuthHeaders(resolved!.headers);

        if (options.authConfig?.environment === "production") {
          appendSetCookie(responseHeaders, clearSessionCookie(true));
        }

        sendJson(response, 200, resolved!.currentAccount, responseHeaders);
        return true;
      }

      if (
        options.pool &&
        request.method === "GET" &&
        url.pathname === "/api/admin/accounts"
      ) {
        await requireAdminActor(request);
        const rawStatus = url.searchParams.get("status");

        if (
          rawStatus !== null &&
          !["approved", "pending", "rejected"].includes(rawStatus)
        ) {
          throw new HttpError("Invalid account status.", 400, "BAD_REQUEST");
        }

        sendJson(response, 200, {
          accounts: await listAccounts(
            options.pool,
            (rawStatus ?? undefined) as
              | "approved"
              | "pending"
              | "rejected"
              | undefined
          )
        });
        return true;
      }

      const adminActionMatch = url.pathname.match(
        /^\/api\/admin\/accounts\/([^/]+)\/(approve|reject|disable|enable|revoke-sessions)$/
      );

      if (options.pool && request.method === "POST" && adminActionMatch) {
        const actor = await requireAdminActor(request);
        const input = {
          actorAuthUserId: actor.authUserId,
          targetAuthUserId: adminActionMatch[1]
        };
        const action = adminActionMatch[2];

        if (action === "approve") {
          const approved = await approveAccount(options.pool, input);

          if (options.sender && options.authConfig) {
            queueApprovalEmail(options.sender, {
              accountUrl: `${options.authConfig.baseUrl}/account?approved=1`,
              authUserId: approved.authUserId,
              to: approved.email
            });
          }

          sendJson(response, 200, { account: approved });
          return true;
        }

        if (action === "reject") {
          await rejectAccount(options.pool, input);
        } else if (action === "disable" || action === "enable") {
          await setAccountDisabled(options.pool, {
            ...input,
            disabled: action === "disable"
          });
        } else {
          await revokeAccountSessions(options.pool, input);
        }

        sendJson(response, 200, { ok: true });
        return true;
      }

      if (request.method === "GET" && url.pathname === "/api/profiles") {
        sendJson(response, 200, {
          profiles: await store.getPublicProfiles()
        });
        return true;
      }

      if (request.method === "GET" && url.pathname === "/api/feed/stories") {
        const rawLimit = url.searchParams.get("limit");
        const limit =
          rawLimit === null || rawLimit === ""
            ? undefined
            : /^\d+$/.test(rawLimit)
              ? Number(rawLimit)
              : Number.NaN;

        if (
          limit !== undefined &&
          (!Number.isInteger(limit) || limit < 1 || limit > 50)
        ) {
          throw new HttpError("Invalid feed limit.", 400, "BAD_REQUEST");
        }

        sendJson(
          response,
          200,
          await store.getStoryFeed({
            cursor: url.searchParams.get("cursor") ?? undefined,
            limit
          })
        );
        return true;
      }

      if (request.method === "GET" && url.pathname === "/api/auth/session") {
        const session = await store.getSession(getSessionToken(request));
        sendJson(
          response,
          200,
          { session },
          session ? {} : { "Set-Cookie": clearSessionCookie() }
        );
        return true;
      }

      if (request.method === "POST" && url.pathname === "/api/auth/register") {
        const ipLimit = registrationIpLimiter.consume(
          getClientIp(request, trustProxy)
        );

        if (!ipLimit.allowed) {
          throwRateLimit(ipLimit.retryAfterSeconds);
        }

        const body = await readJsonBody(request);
        const input = parseInput(registrationSchema, body);
        const session = await store.register(input);

        sendJson(
          response,
          201,
          { session: publicSession(session) },
          { "Set-Cookie": sessionCookie(session.token) }
        );
        return true;
      }

      if (request.method === "POST" && url.pathname === "/api/auth/login") {
        const clientIp = getClientIp(request, trustProxy);
        const ipLimit = loginIpLimiter.consume(clientIp);

        if (!ipLimit.allowed) {
          throwRateLimit(ipLimit.retryAfterSeconds);
        }

        const body = await readJsonBody(request);
        const input = parseInput(loginSchema, body);
        const username = normalizeUsername(input.username);
        const usernameLimit = loginUsernameLimiter.check(username);

        if (!usernameLimit.allowed) {
          throwRateLimit(usernameLimit.retryAfterSeconds);
        }

        try {
          const session = await store.login({
            password: input.password,
            username
          });

          loginUsernameLimiter.reset(username);
          sendJson(
            response,
            200,
            { session: publicSession(session) },
            { "Set-Cookie": sessionCookie(session.token) }
          );
        } catch (error) {
          if (
            error instanceof HttpError &&
            error.code === "UNAUTHENTICATED"
          ) {
            loginUsernameLimiter.record(username);
          }

          throw error;
        }

        return true;
      }

      if (request.method === "PATCH" && url.pathname === "/api/users/me") {
        const actor = await requireActor(
          request,
          "Sign in to update your profile."
        );

        const input = parseInput(userPatchSchema, await readJsonBody(request));
        const user = await store.updateCurrentUser(actor, input);
        sendJson(response, 200, { user });
        return true;
      }

      if (request.method === "POST" && url.pathname === "/api/uploads") {
        const actor = await requireActor(request, "Sign in to upload images.");
        const profileId =
          typeof actor === "string" ? actor : actor.profileId;

        const uploadLimit = uploadUserLimiter.consume(profileId);

        if (!uploadLimit.allowed) {
          throwRateLimit(uploadLimit.retryAfterSeconds);
        }

        const input = parseInput(
          uploadRequestSchema,
          await readJsonBody(request)
        );
        const media = await getMedia();
        const result = await media.createUpload(actor, {
          ...input,
          ipAddress: getClientIp(
            request,
            trustProxy,
            Boolean(options.currentAccount)
          ),
          userAgent: request.headers["user-agent"]
        });
        sendJson(response, 201, result);
        return true;
      }

      const uploadCompleteMatch = url.pathname.match(
        /^\/api\/uploads\/([^/]+)\/complete$/
      );

      if (request.method === "POST" && uploadCompleteMatch) {
        const actor = await requireActor(
          request,
          "Sign in to complete uploads."
        );

        const media = await getMedia();
        const result = await media.completeUpload(
          actor,
          uploadCompleteMatch[1],
          {
            ipAddress: getClientIp(
              request,
              trustProxy,
              Boolean(options.currentAccount)
            ),
            userAgent: request.headers["user-agent"]
          }
        );
        sendJson(response, 200, result);
        return true;
      }

      const imageMatch = url.pathname.match(/^\/api\/images\/([^/]+)$/);

      if (request.method === "DELETE" && imageMatch) {
        const actor = await requireActor(request, "Sign in to delete images.");

        const media = await getMedia();
        await media.deleteImage(actor, imageMatch[1], {
          ipAddress: getClientIp(
            request,
            trustProxy,
            Boolean(options.currentAccount)
          ),
          userAgent: request.headers["user-agent"]
        });
        sendJson(response, 200, { ok: true });
        return true;
      }

      if (request.method === "POST" && url.pathname === "/api/auth/logout") {
        await store.logout(getSessionToken(request));
        sendJson(
          response,
          200,
          { ok: true },
          { "Set-Cookie": clearSessionCookie() }
        );
        return true;
      }

      const permissionsMatch = url.pathname.match(
        /^\/api\/stories\/([^/]+)\/permissions$/
      );

      if (request.method === "GET" && permissionsMatch) {
        const actor = await getOptionalActor(request);
        sendJson(
          response,
          200,
          await store.getStoryPermissions(
            actor,
            permissionsMatch[1]
          )
        );
        return true;
      }

      const storyMatch = url.pathname.match(/^\/api\/stories\/([^/]+)$/);

      if (request.method === "GET" && storyMatch) {
        const story = await store.getStory(storyMatch[1]);

        if (!story) {
          throw new HttpError("Story not found.", 404, "NOT_FOUND");
        }

        const actor = await getOptionalActor(request);
        const profileId =
          actor && typeof actor !== "string" ? actor.profileId : actor;
        const role =
          actor && typeof actor !== "string" ? actor.role : "user";

        if (
          story.visibility !== "public" &&
          story.ownerId !== profileId &&
          role !== "admin"
        ) {
          throw new HttpError("Story is private.", 403, "FORBIDDEN");
        }

        sendJson(response, 200, { story });
        return true;
      }

      if (request.method === "POST" && url.pathname === "/api/stories") {
        const actor = await requireActor(request, "Sign in to create stories.");

        const body = parseInput(
          storyPatchSchema,
          await readJsonBody(request)
        ) as StoryPatch;
        const story = await store.createStory(actor, body);

        sendJson(response, 201, { story });
        return true;
      }

      if (storyMatch && request.method === "PUT") {
        const actor = await requireActor(request, "Sign in to edit stories.");

        const body = parseInput(
          storyPatchSchema,
          await readJsonBody(request)
        ) as StoryPatch;
        const story = await store.updateStory(
          actor,
          storyMatch[1],
          body
        );

        sendJson(response, 200, { story });
        return true;
      }

      if (storyMatch && request.method === "DELETE") {
        const actor = await requireActor(request, "Sign in to delete stories.");

        await store.deleteStory(actor, storyMatch[1]);
        sendJson(response, 200, { ok: true });
        return true;
      }

      throw new HttpError("API route not found.", 404, "NOT_FOUND");
    } catch (error) {
      if (error instanceof AccountLifecycleError) {
        sendJson(
          response,
          error.code === "NOT_FOUND" ? 404 : 409,
          { error: error.message, code: error.code }
        );
      } else if (error instanceof HttpError) {
        sendJson(
          response,
          error.statusCode,
          { error: error.message, code: error.code },
          error.code === "RATE_LIMITED" && error.retryAfter
            ? { "Retry-After": String(error.retryAfter) }
            : {}
        );
      } else {
        console.error("Unhandled API error", error);
        sendJson(response, 500, {
          error: "Request failed.",
          code: "INTERNAL_ERROR"
        });
      }

      return true;
    }
  };
}
