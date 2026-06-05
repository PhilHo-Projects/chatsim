import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("app background styles", () => {
  it("keeps the landing shell background distinct from story-card paper art", () => {
    const css = readFileSync("src/index.css", "utf8");

    expect(css).toContain("landing-minimal-sky.png");
    expect(css).not.toContain("landing-soft-paper.png");
  });
});
