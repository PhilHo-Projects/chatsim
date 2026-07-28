import { describe, expect, it } from "vitest";
import { buildProfileArt } from "./profileArt";

const NEON = [
  "var(--neon-1)",
  "var(--neon-2)",
  "var(--neon-3)",
  "var(--neon-4)"
];

describe("generated profile art", () => {
  it("returns the same art for the same handle", () => {
    expect(buildProfileArt("phil")).toEqual(buildProfileArt("phil"));
  });

  it("returns different art for different handles", () => {
    expect(buildProfileArt("phil")).not.toEqual(buildProfileArt("demo-01"));
  });

  it("only ever uses the four neon tokens", () => {
    for (const handle of ["phil", "demo-01", "demo-02", "demo-03", "demo-04"]) {
      const art = buildProfileArt(handle);

      for (const stroke of art.strokes) {
        expect(NEON).toContain(stroke.color);
      }

      for (const node of art.nodes) {
        expect(NEON).toContain(node.color);
      }
    }
  });

  it("renders a squarer, heavier mark in compact mode", () => {
    const full = buildProfileArt("phil");
    const compact = buildProfileArt("phil", { compact: true });

    expect(full.viewBox).toBe("0 0 300 400");
    expect(compact.viewBox).toBe("0 0 300 300");
    expect(compact.strokes.length).toBeLessThan(full.strokes.length);
    expect(compact.strokes[0].width).toBeGreaterThan(full.strokes[0].width);
  });
});
