import type { IncomingMessage, ServerResponse } from "node:http";
import { StoryStore } from "./storyStore";

const SESSION_COOKIE = "chatsim_session";
const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8"
};

type ApiHandlerOptions = {
  store?: StoryStore;
};

function parseCookies(header: string | undefined) {
  return Object.fromEntries(
    (header ?? "")
      .split(";")
      .map((cookie) => cookie.trim())
      .filter(Boolean)
      .map((cookie) => {
        const [name, ...valueParts] = cookie.split("=");
        return [decodeURIComponent(name), decodeURIComponent(valueParts.join("="))];
      })
  );
}

function sessionCookie(token: string) {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=2592000`;
}

function clearSessionCookie() {
  return `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`;
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

  for await (const chunk of request) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<
    string,
    unknown
  >;
}

function getSessionToken(request: IncomingMessage) {
  return parseCookies(request.headers.cookie)[SESSION_COOKIE];
}

function getSessionUserId(store: StoryStore, request: IncomingMessage) {
  return store.getSession(getSessionToken(request))?.user.id ?? null;
}

export function createApiHandler(options: ApiHandlerOptions = {}) {
  const store = options.store ?? StoryStore.open();

  return async function handleApiRequest(
    request: IncomingMessage,
    response: ServerResponse
  ) {
    const url = new URL(request.url ?? "/", "http://localhost");

    if (!url.pathname.startsWith("/api")) {
      return false;
    }

    try {
      if (request.method === "GET" && url.pathname === "/api/profiles") {
        sendJson(response, 200, { profiles: store.getPublicProfiles() });
        return true;
      }

      if (request.method === "GET" && url.pathname === "/api/auth/session") {
        sendJson(response, 200, {
          session: store.getSession(getSessionToken(request))
        });
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

        sendJson(response, 201, { session }, {
          "Set-Cookie": sessionCookie(session.token)
        });
        return true;
      }

      if (request.method === "POST" && url.pathname === "/api/auth/login") {
        const body = await readJsonBody(request);
        const session = await store.login({
          password: String(body.password ?? ""),
          username: String(body.username ?? "")
        });

        sendJson(response, 200, { session }, {
          "Set-Cookie": sessionCookie(session.token)
        });
        return true;
      }

      if (request.method === "POST" && url.pathname === "/api/auth/logout") {
        store.logout(getSessionToken(request));
        sendJson(response, 200, { ok: true }, {
          "Set-Cookie": clearSessionCookie()
        });
        return true;
      }

      const storyMatch = url.pathname.match(/^\/api\/stories\/([^/]+)$/);

      if (request.method === "GET" && storyMatch) {
        const story = store.getStory(storyMatch[1]);

        if (!story) {
          sendJson(response, 404, { error: "Story not found." });
          return true;
        }

        const sessionUserId = getSessionUserId(store, request);

        if (story.visibility !== "public" && story.ownerId !== sessionUserId) {
          sendJson(response, 403, { error: "Story is private." });
          return true;
        }

        sendJson(response, 200, { story });
        return true;
      }

      if (request.method === "POST" && url.pathname === "/api/stories") {
        const session = store.getSession(getSessionToken(request));

        if (!session) {
          sendJson(response, 401, { error: "Sign in to create stories." });
          return true;
        }

        const body = await readJsonBody(request);
        const story = store.createStory(session.user.id, body);

        sendJson(response, 201, { story });
        return true;
      }

      if (storyMatch && request.method === "PUT") {
        const session = store.getSession(getSessionToken(request));

        if (!session) {
          sendJson(response, 401, { error: "Sign in to edit stories." });
          return true;
        }

        const body = await readJsonBody(request);
        const story = store.updateStory(session.user.id, storyMatch[1], body);

        sendJson(response, 200, { story });
        return true;
      }

      if (storyMatch && request.method === "DELETE") {
        const session = store.getSession(getSessionToken(request));

        if (!session) {
          sendJson(response, 401, { error: "Sign in to delete stories." });
          return true;
        }

        store.deleteStory(session.user.id, storyMatch[1]);
        sendJson(response, 200, { ok: true });
        return true;
      }

      sendJson(response, 404, { error: "API route not found." });
      return true;
    } catch (error) {
      sendJson(response, 400, {
        error: error instanceof Error ? error.message : "Request failed."
      });
      return true;
    }
  };
}
