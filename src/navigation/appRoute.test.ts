import { describe, expect, it } from "vitest";
import { formatAppRoute, parseAppRoute } from "./appRoute";

describe("app route helpers", () => {
  it("parses and formats the home route", () => {
    expect(parseAppRoute("/")).toEqual({ name: "home" });
    expect(formatAppRoute({ name: "home" })).toBe("/");
  });

  it("parses and formats profile routes", () => {
    expect(parseAppRoute("/profiles/user-dummy-20")).toEqual({
      name: "profile",
      profileId: "user-dummy-20"
    });
    expect(
      formatAppRoute({ name: "profile", profileId: "user-dummy-20" })
    ).toBe("/profiles/user-dummy-20");
  });

  it("parses and formats story routes", () => {
    expect(parseAppRoute("/stories/story-neon-1")).toEqual({
      name: "story",
      storyId: "story-neon-1"
    });
    expect(formatAppRoute({ name: "story", storyId: "story-neon-1" })).toBe(
      "/stories/story-neon-1"
    );
  });

  it("parses and formats routes under a deployment base path", () => {
    expect(parseAppRoute("/chatsim/", "/chatsim/")).toEqual({ name: "home" });
    expect(parseAppRoute("/chatsim/profiles/user-phil", "/chatsim/")).toEqual({
      name: "profile",
      profileId: "user-phil"
    });
    expect(parseAppRoute("/chatsim/stories/story-phil-1", "/chatsim/")).toEqual({
      name: "story",
      storyId: "story-phil-1"
    });

    expect(formatAppRoute({ name: "home" }, "/chatsim/")).toBe("/chatsim/");
    expect(
      formatAppRoute({ name: "profile", profileId: "user-phil" }, "/chatsim/")
    ).toBe("/chatsim/profiles/user-phil");
    expect(
      formatAppRoute({ name: "story", storyId: "story-phil-1" }, "/chatsim/")
    ).toBe("/chatsim/stories/story-phil-1");
  });

  it("round-trips encoded ids", () => {
    const profileRoute = parseAppRoute("/profiles/profile%20with%20spaces");
    const storyRoute = parseAppRoute("/stories/story%2Fwith%2Fslash");

    expect(profileRoute).toEqual({
      name: "profile",
      profileId: "profile with spaces"
    });
    expect(storyRoute).toEqual({
      name: "story",
      storyId: "story/with/slash"
    });
    expect(formatAppRoute(profileRoute)).toBe(
      "/profiles/profile%20with%20spaces"
    );
    expect(formatAppRoute(storyRoute)).toBe("/stories/story%2Fwith%2Fslash");
  });

  it("falls back to home for unknown or incomplete paths", () => {
    expect(parseAppRoute("/wat")).toEqual({ name: "home" });
    expect(parseAppRoute("/profiles")).toEqual({ name: "home" });
    expect(parseAppRoute("/stories")).toEqual({ name: "home" });
    expect(parseAppRoute("/profiles/")).toEqual({ name: "home" });
  });
});
