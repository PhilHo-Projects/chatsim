// @vitest-environment node
import {
  readFileSync,
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

    for (const username of [
      "admin",
      "phil",
      "neon",
      "orbit",
      "motel",
      "void",
      "dummy01",
      "dummy20"
    ]) {
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
      title: "Ketamine prison"
    });
    expect(profiles[0].stories.map((story) => story.title)).toEqual([
      "Ketamine prison",
      "Battle"
    ]);
    expect(store.getStory("story-phil-battle")).toMatchObject({
      id: "story-phil-battle",
      ownerId: "user-phil",
      storyboard: expect.objectContaining({
        presentationMode: "battle"
      }),
      title: "Battle"
    });
    expect(profiles).toHaveLength(25);
    expect(profiles.find((profile) => profile.username === "dummy01")).toMatchObject({
      displayName: "demo account 01",
      id: "user-dummy-01",
      stories: [
        expect.objectContaining({
          ownerId: "user-dummy-01",
          storyId: "story-dummy-01",
          title: "Placeholder Story 01"
        })
      ],
      username: "dummy01"
    });
    expect(profiles.find((profile) => profile.username === "dummy20")).toMatchObject({
      displayName: "demo account 20",
      id: "user-dummy-20",
      stories: [
        expect.objectContaining({
          ownerId: "user-dummy-20",
          storyId: "story-dummy-20",
          title: "Placeholder Story 20"
        })
      ],
      username: "dummy20"
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
        .filter(
          (user: { username: string }) =>
            !["admin", "dummy01"].includes(user.username)
        )
        .map((user: Record<string, unknown>) => {
          const { role: _role, ...legacyUser } = user;
          return legacyUser;
        });
      legacyData.stories = legacyData.stories.filter(
        (story: { id: string }) => story.id !== "story-dummy-01"
      );
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
      expect(store.snapshot().users.some((user) => user.username === "dummy01")).toBe(true);
      expect(store.getStory("story-dummy-01")).toMatchObject({
        id: "story-dummy-01",
        ownerId: "user-dummy-01",
        title: "Placeholder Story 01"
      });
    } finally {
      rmSync(tempDir, { force: true, recursive: true });
    }
  });

  it("repairs stale Phil seed stories in existing store files", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "story-store-"));

    try {
      const dataFile = join(tempDir, "story-store.json");
      const legacyData = createSeedStoreData() as any;
      const staleBattleStory = legacyData.stories.find(
        (story: { id: string }) => story.id === "story-phil-battle"
      );
      const stalePhoneStory = legacyData.stories.find(
        (story: { id: string }) => story.id === "story-phil-1"
      );

      staleBattleStory.storyboard.presentationMode = "phone";
      stalePhoneStory.title = "Story";
      stalePhoneStory.storyboard.title = "Story";
      legacyData.stories = [
        ...legacyData.stories.filter(
          (story: { id: string }) => story.id !== "story-phil-battle"
        ),
        staleBattleStory,
        {
          ...stalePhoneStory,
          id: "story-phil-wyd",
          title: "wyd",
          storyboard: {
            ...stalePhoneStory.storyboard,
            id: "story-phil-wyd",
            title: "wyd"
          }
        },
        {
          ...stalePhoneStory,
          id: "story-phil-1780686378567-f3d08a",
          title: "Story 8",
          storyboard: {
            ...stalePhoneStory.storyboard,
            id: "story-phil-1780686378567-f3d08a",
            scenes: [
              {
                id: "scene-1",
                messages: [
                  {
                    speaker: "viewer",
                    text: "new story opening soon"
                  }
                ]
              }
            ],
            title: "Story 8"
          }
        }
      ];
      writeFileSync(dataFile, JSON.stringify(legacyData), "utf8");

      const store = StoryStore.open(dataFile);

      expect(store.getStory("story-phil-battle")).toMatchObject({
        storyboard: expect.objectContaining({
          presentationMode: "battle"
        })
      });
      expect(store.getStory("story-phil-1")).toMatchObject({
        storyboard: expect.objectContaining({
          title: "Ketamine prison"
        }),
        title: "Ketamine prison"
      });
      expect(store.getStory("story-phil-wyd")).toBeNull();
      expect(store.getStory("story-phil-1780686378567-f3d08a")).toBeNull();
      expect(
        store.getPublicProfiles()[0].stories.map((story) => story.title)
      ).toEqual(["Ketamine prison", "Battle"]);
    } finally {
      rmSync(tempDir, { force: true, recursive: true });
    }
  });

  it("uses CHATSIM_STORE_FILE as the default runtime store path", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "story-store-"));
    const previousStoreFile = process.env.CHATSIM_STORE_FILE;

    try {
      const dataFile = join(tempDir, "story-store.local.json");
      process.env.CHATSIM_STORE_FILE = dataFile;

      const store = StoryStore.open();

      expect(store.getStory("story-phil-1")).toMatchObject({
        id: "story-phil-1",
        ownerId: "user-phil"
      });

      await store.register({
        displayName: "Env Store",
        password: "cloud-room-7",
        username: "envstore"
      });

      expect(readFileSync(dataFile, "utf8")).toContain('"username": "envstore"');
    } finally {
      if (previousStoreFile === undefined) {
        delete process.env.CHATSIM_STORE_FILE;
      } else {
        process.env.CHATSIM_STORE_FILE = previousStoreFile;
      }

      rmSync(tempDir, { force: true, recursive: true });
    }
  });
});
