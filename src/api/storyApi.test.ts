import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizeStoryboard } from "../data/conversationConfig";
import { getApiPath, updateStory } from "./storyApi";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("story API paths", () => {
  it("uses same-origin API routes in local development", () => {
    expect(getApiPath("/api/profiles", "/")).toBe("/api/profiles");
  });

  it("prefixes API routes with the deployment base path", () => {
    expect(getApiPath("/api/profiles", "/chatsim/")).toBe(
      "/chatsim/api/profiles"
    );
    expect(getApiPath("/api/stories/story-phil-1", "/chatsim/")).toBe(
      "/chatsim/api/stories/story-phil-1"
    );
  });

  it("sends image IDs while clearing legacy URL/object fields", async () => {
    const storyboard = normalizeStoryboard({
      activeSceneId: "scene-1",
      id: "story-test",
      scenes: [
        {
          contact: {
            avatarImage: {
              id: "image-avatar",
              variants: {
                card: "https://media.example/card.webp",
                full: "https://media.example/full.webp",
                thumb: "https://media.example/thumb.webp"
              }
            },
            avatarImageId: "image-avatar",
            avatarUrl: "data:image/png;base64,AAAA",
            initials: "M",
            name: "Maya",
            status: "online now",
            typingSpeedLevel: 3
          },
          id: "scene-1",
          messages: [],
          viewer: {
            avatarUrl: "",
            initials: "F",
            name: "Frank",
            status: "online now"
          }
        }
      ],
      title: "Story"
    } as never);
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          story: {
            coverColor: "#000",
            coverImageId: null,
            createdAt: "2026-07-25T12:00:00.000Z",
            id: "story-test",
            ownerId: "user-test",
            storyboard,
            title: "Story",
            updatedAt: "2026-07-25T12:00:00.000Z",
            visibility: "public"
          }
        }),
        {
          headers: { "Content-Type": "application/json" },
          status: 200
        }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    await updateStory("story-test", {
      coverColor: "#000",
      createdAt: "2026-07-25T12:00:00.000Z",
      id: "story-test",
      ownerId: "user-test",
      storyboard,
      title: "Story",
      updatedAt: "2026-07-25T12:00:00.000Z",
      visibility: "public"
    });

    const request = fetchMock.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(String(request.body));
    const contact = body.storyboard.scenes[0].contact;

    expect(Object.keys(body).sort()).toEqual([
      "coverColor",
      "storyboard",
      "title",
      "visibility"
    ]);
    expect(contact.avatarImageId).toBe("image-avatar");
    expect(contact.avatarUrl).toBe("");
    expect(contact.avatarImage).toBeUndefined();
  });
});
