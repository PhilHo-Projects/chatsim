import type {
  PublicProfile,
  SessionPayload,
  StoryRecord
} from "./storyStore";

const SESSION_COOKIE = "chatsim_session";
const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8"
};

type MaybePromise<T> = T | Promise<T>;

export type StoryApiStore = {
  createStory(
    ownerId: string,
    patch?: Partial<StoryRecord>
  ): MaybePromise<StoryRecord>;
  deleteStory(ownerId: string, storyId: string): MaybePromise<void>;
  getPublicProfiles(): MaybePromise<PublicProfile[]>;
  getSession(token: string | undefined): MaybePromise<SessionPayload | null>;
  getStory(storyId: string): MaybePromise<StoryRecord | null>;
  login(input: { password: string; username: string }): MaybePromise<SessionPayload>;
  logout(token: string | undefined): MaybePromise<void>;
  register(input: {
    displayName?: string;
    password: string;
    username: string;
  }): MaybePromise<SessionPayload>;
  updateStory(
    ownerId: string,
    storyId: string,
    patch: Partial<StoryRecord>
  ): MaybePromise<StoryRecord>;
};

type ApiHandlerOptions = {
  store: StoryApiStore;
};

function parseCookies(header: string | null) {
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

function jsonResponse(
  status: number,
  payload: unknown,
  extraHeaders: Record<string, string> = {}
) {
  return new Response(JSON.stringify(payload), {
    headers: {
      ...JSON_HEADERS,
      ...extraHeaders
    },
    status
  });
}

async function readJsonBody(request: Request) {
  const text = await request.text();

  if (!text.trim()) {
    return {};
  }

  return JSON.parse(text) as Record<string, unknown>;
}

function getSessionToken(request: Request) {
  return parseCookies(request.headers.get("Cookie"))[SESSION_COOKIE];
}

async function getSessionUserId(store: StoryApiStore, request: Request) {
  return (await store.getSession(getSessionToken(request)))?.user.id ?? null;
}

export function createFetchApiHandler(options: ApiHandlerOptions) {
  const { store } = options;

  return async function handleApiRequest(request: Request) {
    const url = new URL(request.url);

    if (!url.pathname.startsWith("/api")) {
      return null;
    }

    try {
      if (request.method === "GET" && url.pathname === "/api/profiles") {
        return jsonResponse(200, {
          profiles: await store.getPublicProfiles()
        });
      }

      if (request.method === "GET" && url.pathname === "/api/auth/session") {
        return jsonResponse(200, {
          session: await store.getSession(getSessionToken(request))
        });
      }

      if (request.method === "POST" && url.pathname === "/api/auth/register") {
        const body = await readJsonBody(request);
        const session = await store.register({
          displayName:
            typeof body.displayName === "string" ? body.displayName : undefined,
          password: String(body.password ?? ""),
          username: String(body.username ?? "")
        });

        return jsonResponse(201, { session }, {
          "Set-Cookie": sessionCookie(session.token)
        });
      }

      if (request.method === "POST" && url.pathname === "/api/auth/login") {
        const body = await readJsonBody(request);
        const session = await store.login({
          password: String(body.password ?? ""),
          username: String(body.username ?? "")
        });

        return jsonResponse(200, { session }, {
          "Set-Cookie": sessionCookie(session.token)
        });
      }

      if (request.method === "POST" && url.pathname === "/api/auth/logout") {
        await store.logout(getSessionToken(request));

        return jsonResponse(200, { ok: true }, {
          "Set-Cookie": clearSessionCookie()
        });
      }

      const storyMatch = url.pathname.match(/^\/api\/stories\/([^/]+)$/);

      if (request.method === "GET" && storyMatch) {
        const story = await store.getStory(storyMatch[1]);

        if (!story) {
          return jsonResponse(404, { error: "Story not found." });
        }

        const sessionUserId = await getSessionUserId(store, request);

        if (story.visibility !== "public" && story.ownerId !== sessionUserId) {
          return jsonResponse(403, { error: "Story is private." });
        }

        return jsonResponse(200, { story });
      }

      if (request.method === "POST" && url.pathname === "/api/stories") {
        const session = await store.getSession(getSessionToken(request));

        if (!session) {
          return jsonResponse(401, { error: "Sign in to create stories." });
        }

        const body = await readJsonBody(request);
        const story = await store.createStory(session.user.id, body);

        return jsonResponse(201, { story });
      }

      if (storyMatch && request.method === "PUT") {
        const session = await store.getSession(getSessionToken(request));

        if (!session) {
          return jsonResponse(401, { error: "Sign in to edit stories." });
        }

        const body = await readJsonBody(request);
        const story = await store.updateStory(session.user.id, storyMatch[1], body);

        return jsonResponse(200, { story });
      }

      if (storyMatch && request.method === "DELETE") {
        const session = await store.getSession(getSessionToken(request));

        if (!session) {
          return jsonResponse(401, { error: "Sign in to delete stories." });
        }

        await store.deleteStory(session.user.id, storyMatch[1]);

        return jsonResponse(200, { ok: true });
      }

      return jsonResponse(404, { error: "API route not found." });
    } catch (error) {
      return jsonResponse(400, {
        error: error instanceof Error ? error.message : "Request failed."
      });
    }
  };
}
