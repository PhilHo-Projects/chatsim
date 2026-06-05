import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("repository hygiene", () => {
  it("keeps local browser diagnostics ignored", () => {
    const gitignore = readFileSync(".gitignore", "utf8");

    expect(gitignore).toContain(".playwright-cli/");
  });

  it("keeps TypeScript-authored Vite config as the only config artifact", () => {
    expect(existsSync("vite.config.ts")).toBe(true);
    expect(existsSync("vite.config.js")).toBe(false);
    expect(existsSync("vite.config.d.ts")).toBe(false);
  });
});
