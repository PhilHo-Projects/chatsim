// @vitest-environment node
import {
  mkdtempSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createSeedStoreData, StoryStore } from "./storyStore";

describe("StoryStore", () => {
  it("seeds the admin and mock accounts with password-backed sessions", async () => {
    const store = StoryStore.createMemory(createSeedStoreData());

    for (const username of ["admin", "phil", "neon", "orbit", "motel", "void"]) {
      const session = await store.login({
        password: "0000",
        username
      });

      expect(session.user).toMatchObject({
        role: username === "admin" ? "admin" : "member",
        username
      });
    }
  });

  it("returns public profiles without leaking password or session data", () => {
    const store = StoryStore.createMemory(createSeedStoreData());

    const profiles = store.getPublicProfiles();

    expect(profiles[0]).toMatchObject({
      displayName: "phil's stories",
      username: "phil"
    });
    expect(profiles[0].stories[0]).toMatchObject({
      ownerId: "user-phil",
      storyId: "story-phil-1",
      title: "Story"
    });
    expect(JSON.stringify(profiles)).not.toContain("passwordHash");
    expect(JSON.stringify(profiles)).not.toContain("sessions");
    expect(profiles.some((profile) => profile.username === "admin")).toBe(false);
  });

  it("creates password-backed accounts and session tokens without storing plain passwords", async () => {
    const store = StoryStore.createMemory(createSeedStoreData());

    const session = await store.register({
      displayName: "Tiny Studio",
      password: "cloud-room-7",
      username: "tiny"
    });

    expect(session.user).toMatchObject({
      displayName: "Tiny Studio",
      id: expect.any(String),
      username: "tiny"
    });
    expect(session.token).toEqual(expect.any(String));
    expect(store.getSession(session.token)?.user.username).toBe("tiny");
    expect(JSON.stringify(store.snapshot())).not.toContain("cloud-room-7");
  });

  it("only lets the active owner create, update, or delete their own stories", async () => {
    const store = StoryStore.createMemory(createSeedStoreData());
    const philSession = await store.login({
      password: "0000",
      username: "phil"
    });
    const tinySession = await store.register({
      displayName: "Tiny Studio",
      password: "cloud-room-7",
      username: "tiny"
    });

    const createdStory = store.createStory(tinySession.user.id);

    expect(createdStory.ownerId).toBe(tinySession.user.id);
    expect(() =>
      store.updateStory(philSession.user.id, createdStory.id, {
        title: "stolen title"
      })
    ).toThrow(/owner/i);

    const updatedStory = store.updateStory(tinySession.user.id, createdStory.id, {
      title: "Tiny chaos"
    });

    expect(updatedStory.title).toBe("Tiny chaos");
    expect(() =>
      store.deleteStory(philSession.user.id, createdStory.id)
    ).toThrow(/owner/i);

    store.deleteStory(tinySession.user.id, createdStory.id);

    expect(store.getStory(createdStory.id)).toBeNull();
  });

  it("lets admins update and delete stories owned by other users", async () => {
    const store = StoryStore.createMemory(createSeedStoreData());
    const adminSession = await store.login({
      password: "0000",
      username: "admin"
    });

    const updatedStory = store.updateStory(adminSession.user.id, "story-neon-1", {
      title: "Admin retitle"
    });

    expect(updatedStory).toMatchObject({
      id: "story-neon-1",
      ownerId: "user-neon",
      title: "Admin retitle"
    });

    store.deleteStory(adminSession.user.id, "story-neon-1");

    expect(store.getStory("story-neon-1")).toBeNull();
  });

  it("backfills admin and roles when opening an existing store file", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "story-store-"));

    try {
      const dataFile = join(tempDir, "story-store.json");
      const legacyData = createSeedStoreData() as any;
      legacyData.users = legacyData.users
        .filter((user: { username: string }) => user.username !== "admin")
        .map((user: Record<string, unknown>) => {
          const { role: _role, ...legacyUser } = user;
          return legacyUser;
        });
      writeFileSync(dataFile, JSON.stringify(legacyData), "utf8");

      const store = StoryStore.open(dataFile);
      const adminSession = await store.login({
        password: "0000",
        username: "admin"
      });

      expect(adminSession.user).toMatchObject({
        role: "admin",
        username: "admin"
      });
      expect(
        store.snapshot().users.every((user) => ["admin", "member"].includes(user.role))
      ).toBe(true);
    } finally {
      rmSync(tempDir, { force: true, recursive: true });
    }
  });
});
