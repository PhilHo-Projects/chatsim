import { describe, expect, it } from "vitest";
import canonicalSeed from "./platformSeed.json";
import {
  getSeedStoryRecord,
  getSeedStoryRecords,
  seedProfiles,
  seedStoryRecords
} from "./platformSeed";

describe("platform seed data", () => {
  it("uses one credential-free canonical fixture of handle-only profiles", () => {
    expect(canonicalSeed.users).toHaveLength(5);
    expect(canonicalSeed.stories).toHaveLength(6);
    expect(canonicalSeed.users.map((user) => user.username)).toEqual([
      "phil",
      "demo-01",
      "demo-02",
      "demo-03",
      "demo-04"
    ]);
    expect(JSON.stringify(canonicalSeed)).not.toMatch(
      /passwordHash|passwordSalt|sessions/
    );
  });

  it("gives every profile a bio and no invented title", () => {
    for (const user of canonicalSeed.users) {
      expect(user.bio.length).toBeGreaterThan(0);
      expect(user.bio.length).toBeLessThanOrEqual(160);
      expect(user.displayName).toBe(user.username);
    }

    expect(seedProfiles.every((profile) => profile.bio)).toBe(true);
  });

  it("seeds only Phil's renamed phone story and battle story", () => {
    const philProfile = seedProfiles.find((profile) => profile.id === "user-phil");
    const philStories = seedStoryRecords.filter(
      (story) => story.ownerId === "user-phil"
    );
    const phoneStory = philStories.find((story) => story.id === "story-phil-1");
    const battleStory = philStories.find(
      (story) => story.id === "story-phil-battle"
    );

    expect(philProfile?.stories.map((story) => story.title)).toEqual([
      "Ketamine prison",
      "Battle"
    ]);
    expect(philStories).toHaveLength(2);
    expect(phoneStory?.storyboard.presentationMode).toBe("phone");
    expect(phoneStory?.title).toBe("Ketamine prison");
    expect(battleStory).toMatchObject({
      id: "story-phil-battle",
      ownerId: "user-phil",
      storyboard: expect.objectContaining({
        presentationMode: "battle"
      }),
      title: "Battle"
    });

    // The battle story carries its own dedicated script (Phil on top as the
    // opponent/viewer, Nor at the bottom as the player/contact) rather than
    // reusing Phil's phone story.
    const battleScene = battleStory?.storyboard.scenes[0];
    expect(battleScene?.viewer.name).toBe("Phil");
    expect(battleScene?.contact.name).toBe("Nor");
    expect(battleScene?.messages[0]).toMatchObject({
      speaker: "viewer",
      text: "Nor! I challenge you to a battle!"
    });
    expect(battleScene?.messages.slice(-1)[0]).toMatchObject({
      speaker: "contact",
      text: "ok that was kinda sick ngl. gg"
    });
    expect(philStories.some((story) => story.id === "story-phil-wyd")).toBe(false);
  });

  it("returns isolated story records to runtime consumers", () => {
    const firstRecord = getSeedStoryRecord("story-phil-1");
    const firstCollection = getSeedStoryRecords();

    firstRecord.storyboard.scenes.push(firstRecord.storyboard.scenes[0]);
    firstCollection[0].title = "mutated";

    expect(getSeedStoryRecord("story-phil-1").storyboard.scenes).toHaveLength(5);
    expect(getSeedStoryRecords()[0].title).toBe("Ketamine prison");
  });
});
