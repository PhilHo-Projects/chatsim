// @vitest-environment node
import { createServer, type Server } from "node:http";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { brotliCompressSync } from "node:zlib";
import { Pool } from "pg";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it
} from "vitest";
import { runMigrations } from "./db/migrations";
import { createRequestHandler } from "./httpServer";
import type { AuthRuntimeConfig } from "./auth/config";
import { InMemoryEmailSender } from "./auth/email";
import { bootstrapBetterAuthAdmin } from "./auth/bootstrap";
import { createApplicationRuntime } from "./runtime";
import { StoryStore } from "./storyStore";

type TestServer = {
  baseUrl: string;
};

const openServers: Server[] = [];
const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  "postgresql://chatsim_dev:chatsim_dev@127.0.0.1:54339/chatsim_test";
const adminPool = new Pool({ connectionString: testDatabaseUrl });
const pool = new Pool({
  connectionString: testDatabaseUrl,
  options: "-c search_path=http_server_test"
});
let store: StoryStore;

async function startTestServer(distDir: string): Promise<TestServer> {
  const server = createServer(
    createRequestHandler({
      basePath: "/chatsim",
      distDir,
      store
    })
  );

  openServers.push(server);

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();

  if (!address || typeof address === "string") {
    throw new Error("Expected test server to listen on a TCP port.");
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`
  };
}

function createDistFixture() {
  const distDir = mkdtempSync(join(tmpdir(), "chatsim-dist-"));

  writeFileSync(
    join(distDir, "index.html"),
    '<!doctype html><div id="root">Chatsim shell</div>',
    "utf8"
  );
  writeFileSync(join(distDir, "app.js"), "console.log('chatsim');", "utf8");
  mkdirSync(join(distDir, "assets"));
  writeFileSync(
    join(distDir, "assets", "index-ChViSpQQ.js"),
    "console.log('hashed');",
    "utf8"
  );
  writeFileSync(
    join(distDir, "assets", "index-ChViSpQQ.js.br"),
    brotliCompressSync(Buffer.from("console.log('hashed');", "utf8"))
  );

  return distDir;
}

beforeAll(async () => {
  await adminPool.query("DROP SCHEMA IF EXISTS http_server_test CASCADE");
  await adminPool.query("CREATE SCHEMA http_server_test");
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
  const servers = openServers.splice(0);

  await Promise.all(
    servers.map(
      (server) =>
        new Promise<void>((resolve) => {
          server.close(() => resolve());
        })
    )
  );
});

afterAll(async () => {
  await pool.end();
  await adminPool.query("DROP SCHEMA IF EXISTS http_server_test CASCADE");
  await adminPool.end();
});

describe("createRequestHandler", () => {
  it("mounts the raw Better Auth handler before the application API", async () => {
    const distDir = createDistFixture();
    const authConfig: AuthRuntimeConfig = {
      adminBootstrapEmail: "admin@example.com",
      baseUrl: "http://127.0.0.1:5174",
      emailFrom: "Chatsim <accounts@example.com>",
      environment: "production",
      registrationMode: "closed",
      resendApiKey: null,
      secret: "a-test-secret-that-is-at-least-32-characters",
      trustedOrigins: ["http://127.0.0.1:5174"]
    };
    const runtime = await createApplicationRuntime({
      authConfig,
      pool,
      sender: new InMemoryEmailSender(),
      startCleanup: false
    });
    const server = createServer(
      createRequestHandler({ distDir, runtime })
    );
    openServers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();

    if (!address || typeof address === "string") {
      throw new Error("Expected test server to listen on a TCP port.");
    }

    try {
      const baseUrl = `http://127.0.0.1:${address.port}`;
      const signUp = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
        body: JSON.stringify({
          email: "closed@example.com",
          name: "closed",
          password: "closed-password-2026",
          username: "closed"
        }),
        headers: {
          "Content-Type": "application/json",
          Origin: authConfig.baseUrl
        },
        method: "POST"
      });
      const obsoleteEndpoint = await fetch(`${baseUrl}/api/auth/register`, {
        body: JSON.stringify({
          password: "legacy-password-2026",
          username: "legacy"
        }),
        headers: {
          "Content-Type": "application/json",
          Origin: authConfig.baseUrl
        },
        method: "POST"
      });
      const me = await fetch(`${baseUrl}/api/me`);
      const health = await fetch(`${baseUrl}/api/health`);

      expect(signUp.status).toBe(403);
      expect(obsoleteEndpoint.status).toBe(404);
      expect(await me.json()).toEqual({
        account: null,
        profile: null,
        registrationMode: "closed",
        session: null
      });
      expect(me.headers.get("set-cookie")).toContain(
        "chatsim_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0; Secure"
      );
      expect(await health.json()).toMatchObject({
        auth: "ok",
        database: "ok",
        status: "ok"
      });
    } finally {
      await runtime.close();
      rmSync(distDir, { force: true, recursive: true });
    }
  });

  it("exposes only the scoped account moderation actions to Better Auth admins", async () => {
    const distDir = createDistFixture();
    const authConfig: AuthRuntimeConfig = {
      adminBootstrapEmail: "admin@example.com",
      baseUrl: "http://127.0.0.1:5174",
      emailFrom: "Chatsim <accounts@example.com>",
      environment: "production",
      registrationMode: "approval",
      resendApiKey: null,
      secret: "a-test-secret-that-is-at-least-32-characters",
      trustedOrigins: ["http://127.0.0.1:5174"]
    };
    const sender = new InMemoryEmailSender();
    const runtime = await createApplicationRuntime({
      authConfig,
      pool,
      sender,
      startCleanup: false
    });
    await bootstrapBetterAuthAdmin(pool, {
      email: "admin@example.com",
      password: "admin-password-2026",
      username: "chatsim_admin"
    });
    await pool.query(
      `INSERT INTO auth_user (
         id, name, email, "emailVerified", username, role, "approvalStatus"
       ) VALUES (
         'identity-pending-http', 'pending_http', 'pending@example.com', TRUE,
         'pending_http', 'user', 'pending'
       )`
    );
    const server = createServer(createRequestHandler({ distDir, runtime }));
    openServers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();

    if (!address || typeof address === "string") {
      throw new Error("Expected test server to listen on a TCP port.");
    }

    try {
      const baseUrl = `http://127.0.0.1:${address.port}`;
      const signIn = await fetch(`${baseUrl}/api/auth/sign-in/username`, {
        body: JSON.stringify({
          password: "admin-password-2026",
          username: "chatsim_admin"
        }),
        headers: {
          "Content-Type": "application/json",
          Origin: authConfig.baseUrl
        },
        method: "POST"
      });
      const cookie = signIn.headers.get("set-cookie")?.split(";")[0] ?? "";
      await pool.query(
        `UPDATE auth_session
         SET "expiresAt" = NOW() + INTERVAL '28 days',
             "updatedAt" = NOW() - INTERVAL '2 days'
         WHERE "userId" = (
           SELECT id FROM auth_user WHERE username = 'chatsim_admin'
         )`
      );
      const pending = await fetch(`${baseUrl}/api/admin/accounts?status=pending`, {
        headers: { Cookie: cookie }
      });
      const me = await fetch(`${baseUrl}/api/me`, {
        headers: { Cookie: cookie }
      });
      const approved = await fetch(
        `${baseUrl}/api/admin/accounts/identity-pending-http/approve`,
        {
          headers: { Cookie: cookie, Origin: authConfig.baseUrl },
          method: "POST"
        }
      );
      const missingOrigin = await fetch(
        `${baseUrl}/api/admin/accounts/identity-pending-http/revoke-sessions`,
        { headers: { Cookie: cookie }, method: "POST" }
      );
      await sender.settle();
      const forbiddenBuiltInActions = await Promise.all(
        [
          "/create-user",
          "/impersonate-user",
          "/remove-user",
          "/set-role",
          "/set-user-password",
          "/update-user"
        ].map((path) =>
          fetch(`${baseUrl}/api/auth/admin${path}`, {
            body: JSON.stringify({
              email: "blocked@example.com",
              name: "blocked",
              password: "blocked-password-2026",
              role: "admin",
              userId: "identity-pending-http"
            }),
            headers: {
              "Content-Type": "application/json",
              Cookie: cookie,
              Origin: authConfig.baseUrl
            },
            method: "POST"
          })
        )
      );
      const meSetCookies = (
        me.headers as Headers & { getSetCookie: () => string[] }
      ).getSetCookie();

      expect(signIn.status).toBe(200);
      expect(me.status).toBe(200);
      expect(meSetCookies).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/^__Host-chatsim_session=/),
          expect.stringMatching(/^chatsim_session=;/)
        ])
      );
      expect(me.headers.get("cache-control")).toBe("no-store");
      expect(me.headers.get("pragma")).toBe("no-cache");
      expect(pending.status).toBe(200);
      expect(await pending.json()).toMatchObject({
        accounts: [expect.objectContaining({ username: "pending_http" })]
      });
      expect(approved.status).toBe(200);
      expect(missingOrigin.status).toBe(403);
      expect(await pool.query(
        "SELECT id FROM users WHERE auth_user_id = 'identity-pending-http'"
      )).toMatchObject({ rowCount: 1 });
      expect(sender.messages).toEqual([
        expect.objectContaining({ kind: "approval", to: "pending@example.com" })
      ]);
      expect(forbiddenBuiltInActions.map((response) => response.status)).toEqual(
        [403, 403, 403, 403, 403, 403]
      );
    } finally {
      await runtime.close();
      rmSync(distDir, { force: true, recursive: true });
    }
  });

  it("routes base-path API requests to the story API", async () => {
    const distDir = createDistFixture();

    try {
      const server = await startTestServer(distDir);
      const response = await fetch(`${server.baseUrl}/chatsim/api/profiles`);
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(payload.profiles).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "user-phil",
            username: "phil"
          })
        ])
      );
    } finally {
      rmSync(distDir, { force: true, recursive: true });
    }
  });

  it("redirects the bare base path to the trailing-slash app path", async () => {
    const distDir = createDistFixture();

    try {
      const server = await startTestServer(distDir);
      const response = await fetch(`${server.baseUrl}/chatsim`, {
        redirect: "manual"
      });

      expect(response.status).toBe(301);
      expect(response.headers.get("location")).toBe("/chatsim/");
    } finally {
      rmSync(distDir, { force: true, recursive: true });
    }
  });

  it("serves the Vite shell for app routes under the base path", async () => {
    const distDir = createDistFixture();

    try {
      const server = await startTestServer(distDir);
      const response = await fetch(
        `${server.baseUrl}/chatsim/stories/story-phil-1`
      );
      const body = await response.text();

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/html");
      expect(body).toContain("Chatsim shell");
    } finally {
      rmSync(distDir, { force: true, recursive: true });
    }
  });

  it("serves static assets from the built app directory", async () => {
    const distDir = createDistFixture();

    try {
      const server = await startTestServer(distDir);
      const response = await fetch(`${server.baseUrl}/chatsim/app.js`);
      const body = await response.text();

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/javascript");
      expect(body).toContain("chatsim");
    } finally {
      rmSync(distDir, { force: true, recursive: true });
    }
  });

  it("caches content-hashed assets forever and revalidates the shell", async () => {
    const distDir = createDistFixture();

    try {
      const server = await startTestServer(distDir);
      const hashed = await fetch(
        `${server.baseUrl}/chatsim/assets/index-ChViSpQQ.js`
      );
      const shell = await fetch(`${server.baseUrl}/chatsim/`);

      expect(hashed.headers.get("cache-control")).toBe(
        "public, max-age=31536000, immutable"
      );
      expect(hashed.headers.get("etag")).toBeTruthy();
      expect(shell.headers.get("cache-control")).toBe("no-cache");
    } finally {
      rmSync(distDir, { force: true, recursive: true });
    }
  });

  it("answers a matching entity tag with 304 and no body", async () => {
    const distDir = createDistFixture();

    try {
      const server = await startTestServer(distDir);
      const first = await fetch(`${server.baseUrl}/chatsim/app.js`);
      const entityTag = first.headers.get("etag");

      expect(entityTag).toBeTruthy();

      const second = await fetch(`${server.baseUrl}/chatsim/app.js`, {
        headers: { "If-None-Match": entityTag as string }
      });

      expect(second.status).toBe(304);
      expect(await second.text()).toBe("");
    } finally {
      rmSync(distDir, { force: true, recursive: true });
    }
  });

  it("serves the precompressed sibling when brotli is accepted", async () => {
    const distDir = createDistFixture();

    try {
      const server = await startTestServer(distDir);
      const response = await fetch(
        `${server.baseUrl}/chatsim/assets/index-ChViSpQQ.js`,
        { headers: { "Accept-Encoding": "br" } }
      );

      expect(response.headers.get("vary")).toBe("Accept-Encoding");
      expect(await response.text()).toContain("hashed");
    } finally {
      rmSync(distDir, { force: true, recursive: true });
    }
  });
});
