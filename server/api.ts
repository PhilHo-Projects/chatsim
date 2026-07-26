import type { IncomingMessage, ServerResponse } from "node:http";
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
  media?: Promise<MediaService> | MediaService;
  store?: Promise<StoryStore> | StoryStore;
  trustProxy?: boolean;
};

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const REGISTRATION_WINDOW_MS = 60 * 60 * 1000;

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

function cookieSecurityAttribute() {
  return process.env.NODE_ENV === "production" ? "; Secure" : "";
}

function sessionCookie(token: string) {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESSION_MAX_AGE_SECONDS}${cookieSecurityAttribute()}`;
}

function clearSessionCookie() {
  return `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${cookieSecurityAttribute()}`;
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
  extraHeaders: Record<string, string> = {}
) {
  response.writeHead(statusCode, {
    ...JSON_HEADERS,
    ...extraHeaders
  });
  response.end(JSON.stringify(payload));
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

function getClientIp(request: IncomingMessage, trustProxy: boolean) {
  if (trustProxy) {
    const forwardedFor = request.headers["x-forwarded-for"];
    const firstAddress = (
      Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor
    )
      ?.split(",")[0]
      ?.trim();

    if (firstAddress) {
      return firstAddress;
    }
  }

  return request.socket.remoteAddress ?? "unknown";
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
  const getStore = () => {
    if (options.store) {
      return Promise.resolve(options.store);
    }

    defaultStore ??= StoryStore.open();
    return defaultStore;
  };
  const getMedia = () => {
    if (options.media) {
      return Promise.resolve(options.media);
    }

    defaultMedia ??= Promise.resolve().then(() =>
      createMediaServiceFromEnvironment()
    );
    return defaultMedia;
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
      const store = await getStore();

      if (request.method === "GET" && url.pathname === "/api/health") {
        const healthy = await store.healthCheck();
        sendJson(response, healthy ? 200 : 503, {
          status: healthy ? "ok" : "unavailable",
          database: healthy ? "ok" : "unavailable"
        });
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
        const session = await store.getSession(getSessionToken(request));

        if (!session) {
          throw new HttpError(
            "Sign in to update your profile.",
            401,
            "UNAUTHENTICATED"
          );
        }

        const input = parseInput(userPatchSchema, await readJsonBody(request));
        const user = await store.updateCurrentUser(session.user.id, input);
        sendJson(response, 200, { user });
        return true;
      }

      if (request.method === "POST" && url.pathname === "/api/uploads") {
        const session = await store.getSession(getSessionToken(request));

        if (!session) {
          throw new HttpError(
            "Sign in to upload images.",
            401,
            "UNAUTHENTICATED"
          );
        }

        const input = parseInput(
          uploadRequestSchema,
          await readJsonBody(request)
        );
        const media = await getMedia();
        const result = await media.createUpload({
          ...input,
          ipAddress: getClientIp(request, trustProxy),
          userAgent: request.headers["user-agent"],
          userId: session.user.id
        });
        sendJson(response, 201, result);
        return true;
      }

      const uploadCompleteMatch = url.pathname.match(
        /^\/api\/uploads\/([^/]+)\/complete$/
      );

      if (request.method === "POST" && uploadCompleteMatch) {
        const session = await store.getSession(getSessionToken(request));

        if (!session) {
          throw new HttpError(
            "Sign in to complete uploads.",
            401,
            "UNAUTHENTICATED"
          );
        }

        const media = await getMedia();
        const result = await media.completeUpload(
          session.user.id,
          uploadCompleteMatch[1],
          {
            ipAddress: getClientIp(request, trustProxy),
            userAgent: request.headers["user-agent"]
          }
        );
        sendJson(response, 200, result);
        return true;
      }

      const imageMatch = url.pathname.match(/^\/api\/images\/([^/]+)$/);

      if (request.method === "DELETE" && imageMatch) {
        const session = await store.getSession(getSessionToken(request));

        if (!session) {
          throw new HttpError(
            "Sign in to delete images.",
            401,
            "UNAUTHENTICATED"
          );
        }

        const media = await getMedia();
        await media.deleteImage(session.user.id, imageMatch[1], {
          ipAddress: getClientIp(request, trustProxy),
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
        const session = await store.getSession(getSessionToken(request));
        sendJson(
          response,
          200,
          await store.getStoryPermissions(
            session?.user.id ?? null,
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

        const session = await store.getSession(getSessionToken(request));

        if (
          story.visibility !== "public" &&
          story.ownerId !== session?.user.id &&
          session?.user.role !== "admin"
        ) {
          throw new HttpError("Story is private.", 403, "FORBIDDEN");
        }

        sendJson(response, 200, { story });
        return true;
      }

      if (request.method === "POST" && url.pathname === "/api/stories") {
        const session = await store.getSession(getSessionToken(request));

        if (!session) {
          throw new HttpError(
            "Sign in to create stories.",
            401,
            "UNAUTHENTICATED"
          );
        }

        const body = parseInput(
          storyPatchSchema,
          await readJsonBody(request)
        ) as StoryPatch;
        const story = await store.createStory(session.user.id, body);

        sendJson(response, 201, { story });
        return true;
      }

      if (storyMatch && request.method === "PUT") {
        const session = await store.getSession(getSessionToken(request));

        if (!session) {
          throw new HttpError(
            "Sign in to edit stories.",
            401,
            "UNAUTHENTICATED"
          );
        }

        const body = parseInput(
          storyPatchSchema,
          await readJsonBody(request)
        ) as StoryPatch;
        const story = await store.updateStory(
          session.user.id,
          storyMatch[1],
          body
        );

        sendJson(response, 200, { story });
        return true;
      }

      if (storyMatch && request.method === "DELETE") {
        const session = await store.getSession(getSessionToken(request));

        if (!session) {
          throw new HttpError(
            "Sign in to delete stories.",
            401,
            "UNAUTHENTICATED"
          );
        }

        await store.deleteStory(session.user.id, storyMatch[1]);
        sendJson(response, 200, { ok: true });
        return true;
      }

      throw new HttpError("API route not found.", 404, "NOT_FOUND");
    } catch (error) {
      if (error instanceof HttpError) {
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
