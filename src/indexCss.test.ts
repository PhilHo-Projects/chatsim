import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("app theme tokens", () => {
  it("defines the four neon tokens on a near-black base", () => {
    const css = readFileSync("src/index.css", "utf8");

    expect(css).toContain("--neon-1: #ff2d78");
    expect(css).toContain("--neon-2: #22d3ee");
    expect(css).toContain("--neon-3: #a855f7");
    expect(css).toContain("--neon-4: #38bdf8");
    expect(css).toContain("--base: #050507");
  });

  it("carries no light-mode variant for the shell", () => {
    const css = readFileSync("src/index.css", "utf8");

    expect(css).not.toContain("@custom-variant dark");
    expect(css).not.toContain("landing-minimal-sky.webp");
  });

  it("keeps the edge background filter-free and compositor-only", () => {
    const css = readFileSync("src/index.css", "utf8");
    const neonCss = css.slice(
      css.indexOf("/* --- Lightweight edge tendrils --- */")
    );

    expect(neonCss).not.toContain("filter:");
    expect(neonCss).not.toContain("backdrop-filter");
    expect(neonCss).not.toContain("mix-blend-mode");
    expect(neonCss).not.toContain("stroke-dashoffset");
    expect(neonCss).not.toContain("neon-flow");
    expect(neonCss).toContain("@keyframes neon-edge-drift-left");
    expect(neonCss).toContain("@keyframes neon-edge-drift-right");
    expect(neonCss).toContain("@keyframes neon-spark-breathe");
  });

  it("uses opaque browsing surfaces without live backdrop blur", () => {
    const css = readFileSync("src/index.css", "utf8");
    const appGlass = css.match(/\.app-glass\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(css).toContain("--surface: rgba(10, 9, 13, 0.92)");
    expect(css).not.toContain("backdrop-filter");
    expect(appGlass).toContain("background: var(--surface)");
  });
});
