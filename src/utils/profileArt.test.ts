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
    // Compact's width range ([4, 5.4)) and full's ([0.8, 2.2)) never overlap,
    // so this only confirms the two ranges stay disjoint in the intended
    // direction. It is not a check that the two modes draw in lockstep or
    // share any other state.
    expect(compact.strokes[0].width).toBeGreaterThan(full.strokes[0].width);
  });

  it("keeps every stroke's width positive and opacity within (0, 1]", () => {
    for (const handle of ["phil", "demo-01", "demo-02", "demo-03", "demo-04"]) {
      for (const compact of [false, true]) {
        const art = buildProfileArt(handle, { compact });

        for (const stroke of art.strokes) {
          expect(stroke.width).toBeGreaterThan(0);
          expect(stroke.opacity).toBeGreaterThan(0);
          expect(stroke.opacity).toBeLessThanOrEqual(1);
        }
      }
    }
  });
});
