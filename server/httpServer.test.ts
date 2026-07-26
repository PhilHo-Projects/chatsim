// @vitest-environment node
import { createServer, type Server } from "node:http";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
});
