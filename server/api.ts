import type { IncomingMessage, ServerResponse } from "node:http";
import { HttpError } from "./httpError";
import {
  StoryStore,
  type SessionPayload,
  type StartedSession
} from "./storyStore";

const SESSION_COOKIE = "chatsim_session";
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const MAX_JSON_BODY_BYTES = 1024 * 1024;
const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8"
};

type ApiHandlerOptions = {
  store?: Promise<StoryStore> | StoryStore;
};

function parseCookies(header: string | undefined) {
  return Object.fromEntries(
    (header ?? "")
      .split(";")
      .map((cookie) => cookie.trim())
      .filter(Boolean)
      .map((cookie) => {
        const [name, ...valueParts] = cookie.split("=");
        return [
          decodeURIComponent(name),
          decodeURIComponent(valueParts.join("="))
        ];
      })
  );
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

export function createApiHandler(options: ApiHandlerOptions = {}) {
  let defaultStore: Promise<StoryStore> | undefined;
  const getStore = () => {
    if (options.store) {
      return Promise.resolve(options.store);
    }

    defaultStore ??= StoryStore.open();
    return defaultStore;
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
        const limit = url.searchParams.has("limit")
          ? Number.parseInt(url.searchParams.get("limit") ?? "", 10)
          : undefined;

        if (limit !== undefined && !Number.isFinite(limit)) {
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
        const body = await readJsonBody(request);
        const session = await store.register({
          displayName:
            typeof body.displayName === "string" ? body.displayName : undefined,
          password: String(body.password ?? ""),
          username: String(body.username ?? "")
        });

        sendJson(
          response,
          201,
          { session: publicSession(session) },
          { "Set-Cookie": sessionCookie(session.token) }
        );
        return true;
      }

      if (request.method === "POST" && url.pathname === "/api/auth/login") {
        const body = await readJsonBody(request);
        const session = await store.login({
          password: String(body.password ?? ""),
          username: String(body.username ?? "")
        });

        sendJson(
          response,
          200,
          { session: publicSession(session) },
          { "Set-Cookie": sessionCookie(session.token) }
        );
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

        const body = await readJsonBody(request);
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

        const body = await readJsonBody(request);
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
          error.code === "RATE_LIMITED" && "retryAfter" in error
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
