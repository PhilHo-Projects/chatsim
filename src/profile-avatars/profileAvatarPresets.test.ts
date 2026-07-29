import { describe, expect, it } from "vitest";
import {
  PROFILE_AVATAR_PRESETS,
  PROFILE_AVATAR_PRESET_IDS,
  getProfileAvatarPresetId
} from "./profileAvatarPresets";

const APPROVED_COLORS = [
  "var(--neon-1)",
  "var(--neon-2)",
  "var(--neon-3)",
  "var(--neon-4)"
];

describe("profile avatar presets", () => {
  it("defines the five stable, visually distinct presets", () => {
    expect(PROFILE_AVATAR_PRESET_IDS).toEqual([
      "sitting",
      "waving",
      "leaning",
      "walking",
      "floating"
    ]);

    const geometry = PROFILE_AVATAR_PRESET_IDS.map((id) =>
      JSON.stringify(PROFILE_AVATAR_PRESETS[id])
    );

    expect(new Set(geometry)).toHaveLength(5);
  });

  it("uses only approved theme colors", () => {
    for (const preset of Object.values(PROFILE_AVATAR_PRESETS)) {
      expect(APPROVED_COLORS).toContain(preset.primaryColor);
      expect(APPROVED_COLORS).toContain(preset.secondaryColor);
    }
  });

  it("assigns the five showcase profiles explicitly", () => {
    expect(getProfileAvatarPresetId("user-phil")).toBe("sitting");
    expect(getProfileAvatarPresetId("user-demo-01")).toBe("waving");
    expect(getProfileAvatarPresetId("user-demo-02")).toBe("leaning");
    expect(getProfileAvatarPresetId("user-demo-03")).toBe("walking");
    expect(getProfileAvatarPresetId("user-demo-04")).toBe("floating");
  });

  it("selects a stable catalog fallback for an unknown profile", () => {
    const first = getProfileAvatarPresetId("user-future");
    const second = getProfileAvatarPresetId("user-future");

    expect(second).toBe(first);
    expect(PROFILE_AVATAR_PRESET_IDS).toContain(first);
  });
});
