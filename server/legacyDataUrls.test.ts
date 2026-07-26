// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  decodeLegacyDataUrl,
  findLegacyDataUrlReferences
} from "./legacyDataUrls";

describe("legacy data URL extraction", () => {
  it("finds only supported speaker avatar data URLs without exposing bytes", () => {
    const storyboard = {
      scenes: [
        {
          contact: {
            avatarUrl: `data:image/png;base64,${Buffer.from("png").toString("base64")}`
          },
          viewer: {
            avatarUrl: "https://example.com/avatar.png"
          }
        },
        {
          contact: {
            avatarUrl: `data:image/svg+xml;base64,${Buffer.from("<svg/>").toString("base64")}`
          },
          viewer: {
            avatarUrl: `data:image/webp;base64,${Buffer.from("webp").toString("base64")}`
          }
        }
      ]
    };

    const references = findLegacyDataUrlReferences(storyboard);

    expect(references.map(({ mimeType, sceneIndex, speaker }) => ({
      mimeType,
      sceneIndex,
      speaker
    }))).toEqual([
      { mimeType: "image/png", sceneIndex: 0, speaker: "contact" },
      { mimeType: "image/webp", sceneIndex: 1, speaker: "viewer" }
    ]);
    expect(references.every((reference) => reference.body.byteLength > 0)).toBe(
      true
    );
  });

  it("rejects malformed base64 payloads", () => {
    expect(() =>
      decodeLegacyDataUrl("data:image/png;base64,%%%")
    ).toThrow();
  });
});
