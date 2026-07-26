// @vitest-environment node
import { createServer, type Server } from "node:http";
import { Pool } from "pg";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from "vitest";
import { createApiHandler } from "./api";
import { runMigrations } from "./db/migrations";
import type { MediaService } from "./mediaService";
import { StoryStore } from "./storyStore";

const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  "postgresql://chatsim_dev:chatsim_dev@127.0.0.1:54339/chatsim_test";
const adminPool = new Pool({ connectionString: testDatabaseUrl });
const pool = new Pool({
  connectionString: testDatabaseUrl,
  options: "-c search_path=api_test"
});
const openServers: Server[] = [];
let store: StoryStore;

async function startApiServer(
  media?: MediaService,
  storeOverride: Promise<StoryStore> | StoryStore = store,
  trustProxy = false
) {
  const handleApi = createApiHandler({
    media,
    store: storeOverride,
    trustProxy
  });
  const server = createServer(async (request, response) => {
    if (!(await handleApi(request, response))) {
      response.writeHead(404).end();
    }
  });

  openServers.push(server);
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();

  if (!address || typeof address === "string") {
    throw new Error("Expected a TCP listener.");
  }

  return `http://127.0.0.1:${address.port}`;
}

async function sendJson(
  baseUrl: string,
  path: string,
  body: unknown,
  options: {
    cookie?: string;
    forwardedFor?: string;
    method?: "DELETE" | "PATCH" | "POST" | "PUT";
  } = {}
) {
  return fetch(`${baseUrl}${path}`, {
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
      ...(options.cookie ? { Cookie: options.cookie } : {}),
      ...(options.forwardedFor
        ? { "X-Forwarded-For": options.forwardedFor }
        : {})
    },
    method: options.method ?? "POST"
  });
}

beforeAll(async () => {
  await adminPool.query("DROP SCHEMA IF EXISTS api_test CASCADE");
  await adminPool.query("CREATE SCHEMA api_test");
  await runMigrations(pool);
});

beforeEach(async () => {
  await pool.query(
    `TRUNCATE upload_audit_log, stories, sessions, images, users
     RESTART IDENTITY CASCADE`
  );
  store = await StoryStore.open({
    pool,
    runMigrations: false,
    startCleanup: false
  });
  await store.seed();
});

afterEach(async () => {
  vi.unstubAllEnvs();
  const servers = openServers.splice(0);
  await Promise.all(
    servers.map(
      (server) =>
        new Promise<void>((resolve) => server.close(() => resolve()))
    )
  );
});

afterAll(async () => {
  await pool.end();
  await adminPool.query("DROP SCHEMA IF EXISTS api_test CASCADE");
  await adminPool.end();
});

describe("story API auth", () => {
  it("reports health as unavailable when the store cannot initialize", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const unavailableStore = {
      then(
        _resolve: (value: StoryStore) => void,
        reject: (reason: Error) => void
      ) {
        reject(new Error("database unavailable"));
      }
    } as unknown as Promise<StoryStore>;
    const baseUrl = await startApiServer(
      undefined,
      unavailableStore
    );
    const response = await fetch(`${baseUrl}/api/health`);

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      database: "unavailable",
      status: "unavailable"
    });
  });

  it("keeps opaque session tokens out of JSON and uses hardened cookies", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const baseUrl = await startApiServer();
    const registration = await sendJson(baseUrl, "/api/auth/register", {
      displayName: "Maya",
      password: "maya-password-2026",
      username: "maya"
    });
    const body = await registration.json();
    const cookie = registration.headers.get("set-cookie");

    expect(registration.status).toBe(201);
    expect(body).toEqual({
      session: {
        expiresAt: expect.any(String),
        user: expect.objectContaining({ username: "maya" })
      }
    });
    expect(JSON.stringify(body)).not.toContain("token");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
  });

  it("returns enumeration-safe failures and limits failed usernames", async () => {
    const baseUrl = await startApiServer();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await sendJson(baseUrl, "/api/auth/login", {
        password: "not-the-password",
        username: "phil"
      });
      const body = await response.json();

      expect(response.status).toBe(401);
      expect(body.error).toBe("Invalid username or password.");
    }

    const blocked = await sendJson(baseUrl, "/api/auth/login", {
      password: "not-the-password",
      username: "phil"
    });

    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
  });

  it("limits all login attempts per IP independently of usernames", async () => {
    const baseUrl = await startApiServer();

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const response = await sendJson(baseUrl, "/api/auth/login", {
        password: "not-the-password",
        username: `missing-${attempt}`
      });

      expect(response.status).toBe(401);
    }

    const blocked = await sendJson(baseUrl, "/api/auth/login", {
      password: "not-the-password",
      username: "another-missing-user"
    });

    expect(blocked.status).toBe(429);
  });

  it("uses the rightmost valid forwarded address from a private proxy", async () => {
    const baseUrl = await startApiServer(undefined, store, true);

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const response = await sendJson(
        baseUrl,
        "/api/auth/login",
        {
          password: "not-the-password",
          username: `proxied-${attempt}`
        },
        {
          forwardedFor: `198.51.100.${attempt}, 203.0.113.9`
        }
      );

      expect(response.status).toBe(401);
    }

    const blocked = await sendJson(
      baseUrl,
      "/api/auth/login",
      {
        password: "not-the-password",
        username: "proxied-final"
      },
      { forwardedFor: "192.0.2.200, 203.0.113.9" }
    );

    expect(blocked.status).toBe(429);
  });

  it("limits registration attempts per IP", async () => {
    const baseUrl = await startApiServer();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await sendJson(baseUrl, "/api/auth/register", {
        password: "password",
        username: `weak-${attempt}`
      });

      expect(response.status).toBe(400);
    }

    const blocked = await sendJson(baseUrl, "/api/auth/register", {
      password: "password",
      username: "weak-final"
    });

    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
  });

  it("clears invalid session cookies", async () => {
    const baseUrl = await startApiServer();
    const response = await fetch(`${baseUrl}/api/auth/session`, {
      headers: { Cookie: "chatsim_session=invalid-token" }
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ session: null });
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("treats malformed cookie encoding as an invalid session", async () => {
    const baseUrl = await startApiServer();
    const response = await fetch(`${baseUrl}/api/auth/session`, {
      headers: { Cookie: "chatsim_session=%" }
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ session: null });
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });
});

describe("story API validation and authorization", () => {
  it("requires JSON content types and bounds request bodies", async () => {
    const baseUrl = await startApiServer();
    const wrongType = await fetch(`${baseUrl}/api/auth/register`, {
      body: "{}",
      headers: { "Content-Type": "text/plain" },
      method: "POST"
    });
    const tooLarge = await fetch(`${baseUrl}/api/auth/register`, {
      body: JSON.stringify({ padding: "x".repeat(1024 * 1024) }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });

    expect(wrongType.status).toBe(415);
    expect(tooLarge.status).toBe(413);
  });

  it("validates feed cursors and bounds", async () => {
    const baseUrl = await startApiServer();
    const badCursor = await fetch(
      `${baseUrl}/api/feed/stories?cursor=not-a-cursor`
    );
    const oversized = await fetch(`${baseUrl}/api/feed/stories?limit=51`);

    expect(badCursor.status).toBe(400);
    expect(await badCursor.json()).toMatchObject({ code: "BAD_REQUEST" });
    expect(oversized.status).toBe(400);
  });

  it("updates the signed-in user but never another account", async () => {
    const baseUrl = await startApiServer();
    const registration = await sendJson(baseUrl, "/api/auth/register", {
      displayName: "Original",
      password: "profile-password-2026",
      username: "profile-owner"
    });
    const cookie = registration.headers.get("set-cookie")?.split(";")[0];
    const unauthenticated = await sendJson(
      baseUrl,
      "/api/users/me",
      { displayName: "Nope" },
      { method: "PATCH" }
    );
    const updated = await sendJson(
      baseUrl,
      "/api/users/me",
      { displayName: "Updated Profile" },
      { cookie, method: "PATCH" }
    );

    expect(unauthenticated.status).toBe(401);
    expect(updated.status).toBe(200);
    expect(await updated.json()).toEqual({
      user: expect.objectContaining({
        displayName: "Updated Profile",
        username: "profile-owner"
      })
    });
  });

  it("enforces owner permissions on every story write", async () => {
    const baseUrl = await startApiServer();
    const ownerRegistration = await sendJson(
      baseUrl,
      "/api/auth/register",
      {
        displayName: "Owner",
        password: "owner-password-2026",
        username: "story-owner"
      }
    );
    const ownerCookie = ownerRegistration.headers
      .get("set-cookie")
      ?.split(";")[0];
    const otherRegistration = await sendJson(
      baseUrl,
      "/api/auth/register",
      {
        displayName: "Other",
        password: "other-password-2026",
        username: "story-other"
      }
    );
    const otherCookie = otherRegistration.headers
      .get("set-cookie")
      ?.split(";")[0];
    const createdResponse = await sendJson(
      baseUrl,
      "/api/stories",
      { title: "Protected Story" },
      { cookie: ownerCookie }
    );
    const created = await createdResponse.json();
    const permissions = await fetch(
      `${baseUrl}/api/stories/${created.story.id}/permissions`,
      { headers: { Cookie: ownerCookie ?? "" } }
    );
    const forbidden = await sendJson(
      baseUrl,
      `/api/stories/${created.story.id}`,
      { title: "Stolen Story" },
      { cookie: otherCookie, method: "PUT" }
    );

    expect(createdResponse.status).toBe(201);
    expect(await permissions.json()).toEqual({
      canDelete: true,
      canEdit: true
    });
    expect(forbidden.status).toBe(403);
  });

  it("rejects URL-backed images in story writes", async () => {
    const baseUrl = await startApiServer();
    const registration = await sendJson(baseUrl, "/api/auth/register", {
      displayName: "Owner",
      password: "owner-password-2026",
      username: "image-url-owner"
    });
    const cookie = registration.headers.get("set-cookie")?.split(";")[0];
    const response = await sendJson(
      baseUrl,
      "/api/stories",
      {
        storyboard: {
          activeSceneId: "scene-1",
          scenes: [
            {
              contact: {
                avatarUrl: "data:image/png;base64,AAAA"
              }
            }
          ]
        },
        title: "Unsafe Image"
      },
      { cookie }
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects malformed or unbounded storyboard structures", async () => {
    const baseUrl = await startApiServer();
    const registration = await sendJson(baseUrl, "/api/auth/register", {
      displayName: "Owner",
      password: "bounded-story-password",
      username: "bounded-story-owner"
    });
    const cookie = registration.headers.get("set-cookie")?.split(";")[0];
    const malformed = await sendJson(
      baseUrl,
      "/api/stories",
      {
        storyboard: {
          activeSceneId: "scene-1",
          scenes: [{ arbitrary: { nested: true } }]
        },
        title: "Malformed"
      },
      { cookie }
    );
    const tooManyMessages = await sendJson(
      baseUrl,
      "/api/stories",
      {
        storyboard: {
          activeSceneId: "scene-1",
          scenes: [
            {
              contact: {
                avatarUrl: "",
                initials: "M",
                name: "Maya",
                status: "online now",
                typingSpeedLevel: 3
              },
              defaultPauseAfterMs: 1000,
              defaultSpeakerTypingSpeedLevel: 3,
              id: "scene-1",
              messages: Array.from({ length: 101 }, (_, index) => ({
                id: `line-${index}`,
                speaker: "viewer",
                text: "line"
              })),
              sceneTitle: "Scene 1",
              viewer: {
                avatarUrl: "",
                initials: "S",
                name: "Studio",
                status: "online now"
              }
            }
          ]
        },
        title: "Too many lines"
      },
      { cookie }
    );

    expect(malformed.status).toBe(400);
    expect(tooManyMessages.status).toBe(400);
  });

  it("keeps upload routes authenticated and delegates media processing", async () => {
    const fakeImage = {
      height: null,
      id: "image-test",
      kind: "avatar",
      mimeType: "image/png",
      sizeBytes: 100,
      status: "pending",
      variants: null,
      width: null
    };
    const media = {
      completeUpload: vi.fn().mockResolvedValue({
        image: { ...fakeImage, status: "ready" }
      }),
      createUpload: vi.fn().mockResolvedValue({
        image: fakeImage,
        upload: {
          expiresAt: "2026-07-25T12:05:00.000Z",
          headers: { "Content-Type": "image/png" },
          method: "PUT",
          url: "https://uploads.example/test"
        }
      }),
      deleteImage: vi.fn().mockResolvedValue(undefined)
    } as unknown as MediaService;
    const baseUrl = await startApiServer(media);
    const unauthenticated = await sendJson(baseUrl, "/api/uploads", {
      kind: "avatar",
      mimeType: "image/png",
      sizeBytes: 100
    });
    const registration = await sendJson(baseUrl, "/api/auth/register", {
      displayName: "Uploader",
      password: "uploader-password-2026",
      username: "uploader"
    });
    const cookie = registration.headers.get("set-cookie")?.split(";")[0];
    const created = await sendJson(
      baseUrl,
      "/api/uploads",
      {
        kind: "avatar",
        mimeType: "image/png",
        sizeBytes: 100
      },
      { cookie }
    );
    const completed = await sendJson(
      baseUrl,
      "/api/uploads/image-test/complete",
      {},
      { cookie }
    );
    const deleted = await sendJson(
      baseUrl,
      "/api/images/image-test",
      {},
      { cookie, method: "DELETE" }
    );

    expect(unauthenticated.status).toBe(401);
    expect(created.status).toBe(201);
    expect(completed.status).toBe(200);
    expect(deleted.status).toBe(200);
    expect(media.createUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "avatar",
        mimeType: "image/png",
        sizeBytes: 100,
        userId: expect.any(String)
      })
    );
    expect(media.completeUpload).toHaveBeenCalledWith(
      expect.any(String),
      "image-test",
      expect.any(Object)
    );
    expect(media.deleteImage).toHaveBeenCalledWith(
      expect.any(String),
      "image-test",
      expect.any(Object)
    );
  });

  it("rate-limits upload reservations per signed-in user", async () => {
    const media = {
      createUpload: vi.fn().mockResolvedValue({
        image: {
          id: "image-test",
          kind: "avatar",
          status: "pending"
        },
        upload: {
          expiresAt: "2026-07-25T12:05:00.000Z",
          headers: { "Content-Type": "image/png" },
          method: "PUT",
          url: "https://uploads.example/test"
        }
      })
    } as unknown as MediaService;
    const baseUrl = await startApiServer(media);
    const registration = await sendJson(baseUrl, "/api/auth/register", {
      displayName: "Uploader",
      password: "upload-rate-password",
      username: "upload-rate-owner"
    });
    const cookie = registration.headers.get("set-cookie")?.split(";")[0];

    for (let attempt = 0; attempt < 30; attempt += 1) {
      const response = await sendJson(
        baseUrl,
        "/api/uploads",
        {
          kind: "avatar",
          mimeType: "image/png",
          sizeBytes: 100
        },
        { cookie }
      );
      expect(response.status).toBe(201);
    }

    const blocked = await sendJson(
      baseUrl,
      "/api/uploads",
      {
        kind: "avatar",
        mimeType: "image/png",
        sizeBytes: 100
      },
      { cookie }
    );

    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).not.toBeNull();
  });
});
