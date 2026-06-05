import { describe, expect, it } from "vitest";
import { getApiPath } from "./storyApi";

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
});
