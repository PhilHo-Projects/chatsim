import {
  createBlankStoryboard,
  EDITOR_UNLOCK_STORAGE_KEY,
  addStoryScene,
  getPovTypingMsPerCharacter,
  getSpeakerTypingDurationMs,
  isEditorUnlockValid,
  normalizeConversationConfig,
  normalizeStoryLibrary,
  normalizeStoryDatabase,
  removeStoryboard,
  rememberEditorUnlock,
  updateConversationMessage,
  type StoryDatabase
} from "./conversationConfig";

describe("conversation config", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("normalizes editable config values into safe animation settings", () => {
    const config = normalizeConversationConfig({
      contact: {
        name: " Jules ",
        initials: "",
        status: "",
        typingSpeedLevel: -10
      },
      defaultSpeakerTypingSpeedLevel: 9,
      viewer: {
        name: " Frank ",
        initials: ""
      },
      messages: [
        {
          id: "one",
          speaker: "contact",
          text: "hello",
          typingSpeedLevel: 0,
          pauseAfterMs: -4
        }
      ]
    });

    expect(config.contact.name).toBe(" Jules ");
    expect(config.contact.initials).toBe("J");
    expect(config.contact.status).toBe("online now");
    expect(config.defaultSpeakerTypingSpeedLevel).toBe(5);
    expect(config.defaultPauseAfterMs).toBe(1000);
    expect(config.viewer.name).toBe(" Frank ");
    expect(config.viewer.initials).toBe("F");
    expect(config.viewer.status).toBe("online now");
    expect(config.viewer.avatarUrl).toContain("mystery-speaker-avatar");
    expect(config.contact.typingSpeedLevel).toBe(1);
    expect(config.messages[0]).toMatchObject({
      text: "hello",
      typingSpeedLevel: 1,
      pauseAfterMs: 0,
      useDefaultTypingMs: true,
      useDefaultPauseAfterMs: true
    });
  });

  it("updates a single message without mutating the existing config", () => {
    const config = normalizeConversationConfig({
      contact: { name: "Maya", initials: "M", status: "online now" },
      defaultSpeakerTypingSpeedLevel: 3,
      defaultPauseAfterMs: 1000,
      viewer: { name: "Frank", initials: "F" },
      messages: [
        {
          id: "first",
          speaker: "viewer",
          text: "hey",
          typingSpeedLevel: 3,
          pauseAfterMs: 200
        }
      ]
    });

    const nextConfig = updateConversationMessage(config, "first", {
      text: "changed"
    });

    expect(nextConfig.messages[0].text).toBe("changed");
    expect(config.messages[0].text).toBe("hey");
  });

  it("preserves empty editable message text instead of replacing it", () => {
    const config = normalizeConversationConfig({
      messages: [
        {
          id: "first",
          speaker: "viewer",
          text: "",
          typingSpeedLevel: 3,
          pauseAfterMs: 200
        }
      ]
    });

    expect(config.messages[0].text).toBe("");
  });

  it("preserves spaces while editing message text", () => {
    const config = normalizeConversationConfig({
      messages: [
        {
          id: "first",
          speaker: "viewer",
          text: "hey ",
          typingSpeedLevel: 3,
          pauseAfterMs: 200
        }
      ]
    });

    expect(config.messages[0].text).toBe("hey ");
  });

  it("preserves spaces while editing required text fields", () => {
    const config = normalizeConversationConfig({
      sceneTitle: "Scene ",
      contact: { name: "Maya ", initials: "M", status: "online now" },
      viewer: { name: "Frank ", initials: "F", status: "online now" },
      messages: [{ id: "first", speaker: "viewer", text: "hey" }]
    });

    expect(config.sceneTitle).toBe("Scene ");
    expect(config.contact.name).toBe("Maya ");
    expect(config.viewer.name).toBe("Frank ");
  });

  it("keeps blank required profile fields editable for save warnings", () => {
    const config = normalizeConversationConfig({
      contact: { name: "", initials: "", status: "" },
      sceneTitle: "",
      viewer: { name: "", initials: "", status: "" },
      messages: [{ id: "first", speaker: "viewer", text: "hey" }]
    });

    expect(config.sceneTitle).toBe("");
    expect(config.contact.name).toBe("");
    expect(config.contact.initials).toBe("");
    expect(config.contact.status).toBe("online now");
    expect(config.viewer.name).toBe("");
    expect(config.viewer.initials).toBe("");
    expect(config.viewer.status).toBe("online now");
  });

  it("keeps editable avatar URLs and custom typing overrides", () => {
    const config = normalizeConversationConfig({
      contact: {
        name: "Maya",
        initials: "M",
        status: "online now",
        avatarUrl: "/avatars/maya.png",
        typingSpeedLevel: 4
      },
      defaultSpeakerTypingSpeedLevel: 2,
      defaultPauseAfterMs: 1000,
      viewer: { name: "Frank", initials: "F", status: "typing..." },
      messages: [
        {
          id: "viewer-1",
          speaker: "viewer",
          text: "reply",
          typingSpeedLevel: 5,
          pauseAfterMs: 200,
          useDefaultTypingMs: false,
          useDefaultPauseAfterMs: false
        }
      ]
    });

    expect(config.contact.avatarUrl).toBe("/avatars/maya.png");
    expect(config.viewer.avatarUrl).toContain("mystery-speaker-avatar");
    expect(config.viewer.status).toBe("online now");
    expect(config.contact.typingSpeedLevel).toBe(4);
    expect(config.defaultSpeakerTypingSpeedLevel).toBe(2);
    expect(config.messages[0].typingSpeedLevel).toBe(5);
    expect(config.messages[0].useDefaultTypingMs).toBe(false);
    expect(config.messages[0].pauseAfterMs).toBe(200);
    expect(config.messages[0].useDefaultPauseAfterMs).toBe(false);
  });

  it("maps speed levels to deterministic millisecond presets", () => {
    expect(getPovTypingMsPerCharacter(5)).toBeLessThan(
      getPovTypingMsPerCharacter(1)
    );
    expect(getSpeakerTypingDurationMs(5)).toBeLessThan(
      getSpeakerTypingDurationMs(1)
    );
    expect(getPovTypingMsPerCharacter(3)).toBe(58);
    expect(getSpeakerTypingDurationMs(3)).toBe(1100);
  });

  it("migrates legacy millisecond timing values to nearest speed levels", () => {
    const config = normalizeConversationConfig({
      defaultContactTypingMs: 800,
      contact: { typingSpeedMsPerCharacter: 42 },
      messages: [
        {
          id: "viewer",
          speaker: "viewer",
          text: "incoming",
          typingMs: 1400,
          useDefaultTypingMs: false
        },
        {
          id: "contact",
          speaker: "contact",
          text: "hello",
          typingMs: 150,
          useDefaultTypingMs: false
        }
      ]
    });

    expect(config.defaultSpeakerTypingSpeedLevel).toBe(4);
    expect(config.contact.typingSpeedLevel).toBe(4);
    expect(config.messages[0].typingSpeedLevel).toBe(2);
    expect(config.messages[1].typingSpeedLevel).toBe(5);
  });

  it("remembers a valid editor unlock for 24 hours", () => {
    rememberEditorUnlock(1000);

    expect(localStorage.getItem(EDITOR_UNLOCK_STORAGE_KEY)).toBe("1000");
    expect(isEditorUnlockValid(1000 + 23 * 60 * 60 * 1000)).toBe(true);
    expect(isEditorUnlockValid(1000 + 25 * 60 * 60 * 1000)).toBe(false);
  });

  it("normalizes story data into only created scenes", () => {
    const story = normalizeStoryDatabase({
      activeSceneId: "scene-2",
      scenes: [
        {
          id: "scene-1",
          sceneTitle: "Scene 1",
          messages: [{ id: "one", speaker: "viewer", text: "first" }]
        },
        {
          id: "scene-2",
          sceneTitle: "Scene 2",
          messages: [{ id: "two", speaker: "viewer", text: "second" }]
        }
      ]
    });

    expect(story.activeSceneId).toBe("scene-2");
    expect(story.scenes).toHaveLength(2);
    expect(story.scenes[0]).toMatchObject({
      id: "scene-1",
      sceneTitle: "Scene 1"
    });
    expect(story.scenes[1].messages[0].text).toBe("second");
  });

  it("uses one numeric baseline scene for blank stories", () => {
    const story = normalizeStoryDatabase({});

    expect(story.scenes).toHaveLength(1);
    expect(story.scenes[0].sceneTitle).toBe("Scene 1");
  });

  it("trims old auto-generated blank scenes from saved stories", () => {
    const story = normalizeStoryDatabase({
      activeSceneId: "scene-10",
      scenes: [
        {
          id: "scene-1",
          sceneTitle: "Scene 1",
          messages: [{ id: "viewer-1", speaker: "viewer", text: "kept" }]
        },
        ...Array.from({ length: 9 }, (_, index) => {
          const sceneNumber = index + 2;

          return {
            id: `scene-${sceneNumber}`,
            sceneTitle: `Scene ${sceneNumber}`,
            messages: [
              {
                id: `viewer-${sceneNumber}`,
                speaker: "viewer",
                text: ""
              }
            ]
          };
        })
      ]
    });

    expect(story.scenes).toHaveLength(1);
    expect(story.activeSceneId).toBe("scene-1");
  });

  it("adds scenes up to ten and selects the newest scene", () => {
    const story = normalizeStoryDatabase({});

    const secondSceneStory = addStoryScene(story);

    expect(secondSceneStory.scenes).toHaveLength(2);
    expect(secondSceneStory.activeSceneId).toBe("scene-2");
    expect(secondSceneStory.scenes[1]).toMatchObject({
      id: "scene-2",
      sceneTitle: "Scene 2"
    });

    const fullStory = Array.from({ length: 12 }).reduce<StoryDatabase>(
      (currentStory) => addStoryScene(currentStory),
      story
    );

    expect(fullStory.scenes).toHaveLength(10);
    expect(fullStory.activeSceneId).toBe("scene-10");
    expect(normalizeStoryDatabase(fullStory).scenes).toHaveLength(10);
  });

  it("caps scenes at one hundred messages", () => {
    const config = normalizeConversationConfig({
      messages: Array.from({ length: 120 }, (_, index) => ({
        id: `line-${index + 1}`,
        speaker: index % 2 === 0 ? "viewer" : "contact",
        text: `line ${index + 1}`
      }))
    });

    expect(config.messages).toHaveLength(100);
    expect(config.messages[99].text).toBe("line 100");
  });

  it("wraps legacy story data in a local story library", () => {
    const library = normalizeStoryLibrary({
      activeSceneId: "scene-1",
      scenes: [
        {
          id: "scene-1",
          sceneTitle: "Scene One",
          messages: [{ id: "one", speaker: "viewer", text: "first" }]
        }
      ]
    });

    expect(library.activeStoryId).toBe(library.stories[0].id);
    expect(library.stories).toHaveLength(1);
    expect(library.stories[0]).toMatchObject({
      title: "Story",
      activeSceneId: "scene-1"
    });
    expect(library.stories[0].scenes[0].messages[0].text).toBe("first");
  });

  it("names blank stories from a Story baseline", () => {
    expect(createBlankStoryboard(0).title).toBe("Story");
    expect(createBlankStoryboard(1).title).toBe("Story 2");
  });

  it("migrates old generated story titles to the Story baseline", () => {
    const library = normalizeStoryLibrary({
      stories: [
        { id: "story-1", title: "Scene 1", scenes: [] },
        { id: "story-2", title: "Untitled Story 2", scenes: [] },
        { id: "story-3", title: "Custom Title", scenes: [] }
      ]
    });

    expect(library.stories.map((story) => story.title)).toEqual([
      "Story",
      "Story 2",
      "Custom Title"
    ]);
  });

  it("preserves blank editable story titles for save validation", () => {
    const library = normalizeStoryLibrary({
      stories: [{ id: "story-1", title: "", scenes: [] }]
    });

    expect(library.stories[0].title).toBe("");
  });

  it("preserves spaces while editing story titles", () => {
    const library = normalizeStoryLibrary({
      stories: [{ id: "story-1", title: "Tiny chaos ", scenes: [] }]
    });

    expect(library.stories[0].title).toBe("Tiny chaos ");
  });

  it("removes stories while preserving a valid active story", () => {
    const firstStory = createBlankStoryboard(0);
    const secondStory = createBlankStoryboard(1);
    const library = normalizeStoryLibrary({
      activeStoryId: firstStory.id,
      stories: [firstStory, secondStory]
    });

    const nextLibrary = removeStoryboard(library, firstStory.id);

    expect(nextLibrary.stories).toHaveLength(1);
    expect(nextLibrary.stories[0].id).toBe(secondStory.id);
    expect(nextLibrary.activeStoryId).toBe(secondStory.id);

    const fallbackLibrary = removeStoryboard(nextLibrary, secondStory.id);

    expect(fallbackLibrary.stories).toHaveLength(1);
    expect(fallbackLibrary.stories[0].title).toBe("Story");
    expect(fallbackLibrary.activeStoryId).toBe(fallbackLibrary.stories[0].id);
  });
});
