import { describe, expect, it } from "vitest";
import { seedProfiles, seedStoryRecords } from "./platformSeed";

describe("platform seed data", () => {
  it("seeds the battle story after Phil's phone story before simple extras", () => {
    const philProfile = seedProfiles.find((profile) => profile.id === "user-phil");
    const philStories = seedStoryRecords.filter(
      (story) => story.ownerId === "user-phil"
    );
    const phoneStory = philStories.find((story) => story.id === "story-phil-1");
    const battleStory = philStories.find(
      (story) => story.id === "story-phil-battle"
    );

    expect(philProfile?.stories.map((story) => story.title)).toEqual([
      "Story",
      "Battle",
      "wyd",
      "gm",
      "coffee",
      "ping",
      "movie"
    ]);
    expect(philStories).toHaveLength(7);
    expect(phoneStory?.storyboard.presentationMode).toBe("phone");
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
    expect(philStories.find((story) => story.id === "story-phil-wyd")).toMatchObject({
      ownerId: "user-phil",
      storyboard: expect.objectContaining({
        scenes: [
          expect.objectContaining({
            messages: [
              expect.objectContaining({ speaker: "viewer", text: "hello" }),
              expect.objectContaining({ speaker: "contact", text: "wyd" }),
              expect.objectContaining({ speaker: "viewer", text: "nm you?" })
            ]
          })
        ]
      })
    });
  });
});
