import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { StoryStore, type StoryStoreData } from "../server/storyStore";

const DEFAULT_STORE_FILE = "server/data/story-store.local.json";
const DEFAULT_DATABASE_NAME = "chatsim";

function sqlString(value: unknown) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const storeFile = args.find((arg) => !arg.startsWith("--"));
  const databaseName =
    args.find((arg) => arg.startsWith("--database="))?.split("=")[1] ??
    DEFAULT_DATABASE_NAME;
  const sqlOut = args.find((arg) => arg.startsWith("--sql-out="))?.split("=")[1];

  return {
    databaseName,
    execute: !args.includes("--no-execute"),
    remote: !args.includes("--local"),
    sqlOut: sqlOut ? resolve(sqlOut) : undefined,
    storeFile: resolve(
      storeFile ?? process.env.CHATSIM_STORE_FILE ?? DEFAULT_STORE_FILE
    )
  };
}

function createImportSql(data: StoryStoreData) {
  const userStatements = data.users.map((user) =>
    [
      "INSERT INTO users",
      "(id, username, display_name, accent_color, password_hash, password_salt, role, created_at)",
      "VALUES",
      `(${[
        user.id,
        user.username,
        user.displayName,
        user.accentColor,
        user.passwordHash,
        user.passwordSalt,
        user.role,
        user.createdAt
      ].map(sqlString).join(", ")});`
    ].join(" ")
  );

  const storyStatements = data.stories.map((story) =>
    [
      "INSERT INTO stories",
      "(id, owner_id, storyboard_json, title, cover_color, visibility, created_at, updated_at)",
      "VALUES",
      `(${[
        story.id,
        story.ownerId,
        JSON.stringify(story.storyboard),
        story.title,
        story.coverColor,
        story.visibility,
        story.createdAt,
        story.updatedAt
      ].map(sqlString).join(", ")});`
    ].join(" ")
  );

  return [
    "PRAGMA foreign_keys = ON;",
    "DELETE FROM sessions;",
    "DELETE FROM stories;",
    "DELETE FROM users;",
    ...userStatements,
    ...storyStatements
  ].join("\n");
}

function main() {
  const { databaseName, execute, remote, sqlOut, storeFile } = parseArgs();
  const parsed = JSON.parse(readFileSync(storeFile, "utf8")) as StoryStoreData;
  const normalized = StoryStore.createMemory({
    ...parsed,
    sessions: []
  }).snapshot();
  const tempDir = sqlOut ? undefined : mkdtempSync(join(tmpdir(), "chatsim-d1-import-"));
  const importFile = sqlOut ?? join(tempDir ?? tmpdir(), "import.sql");

  try {
    writeFileSync(importFile, createImportSql({
      ...normalized,
      sessions: []
    }));

    if (!execute) {
      console.log(
        `Wrote ${normalized.users.length} users and ${normalized.stories.length} stories to ${importFile}; sessions were skipped.`
      );
      return;
    }

    const command = process.platform === "win32" ? "npx.cmd" : "npx";
    const args = [
      "wrangler",
      "d1",
      "execute",
      databaseName,
      "--file",
      importFile,
      ...(remote ? ["--remote"] : [])
    ];
    const result = spawnSync(command, args, {
      stdio: "inherit"
    });

    if (result.status !== 0) {
      process.exit(result.status ?? 1);
    }

    console.log(
      `Imported ${normalized.users.length} users and ${normalized.stories.length} stories into ${databaseName}; sessions were skipped.`
    );
  } finally {
    if (tempDir) {
      rmSync(tempDir, { force: true, recursive: true });
    }
  }
}

main();
