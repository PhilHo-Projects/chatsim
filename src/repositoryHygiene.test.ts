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

  it("packages a root-path stateless production image", () => {
    const dockerfile = readFileSync("Dockerfile", "utf8");
    const exampleEnvironment = readFileSync(".env.example", "utf8");

    expect(dockerfile).toContain("RUN npm run build");
    expect(dockerfile).toContain("HEALTHCHECK");
    expect(dockerfile).toContain("ca-certificates curl");
    expect(dockerfile).not.toContain("RUN npm test");
    expect(dockerfile).not.toContain("CHATSIM_BASE_PATH");
    expect(dockerfile).not.toContain("CHATSIM_STORE_FILE");
    expect(exampleEnvironment).not.toContain("CHATSIM_BASE_PATH");
    expect(exampleEnvironment).not.toContain("CHATSIM_STORE_FILE");
    expect(existsSync("ecosystem.config.cjs")).toBe(false);
    expect(existsSync("server/data/story-store.json")).toBe(false);
    expect(existsSync("src/data/storyDatabase.json")).toBe(false);
  });

  it("keeps manual deployments behind the full verification job", () => {
    const workflow = readFileSync(".github/workflows/deploy.yml", "utf8");

    expect(workflow).toContain(
      "github.event_name == 'workflow_dispatch' ||"
    );
    expect(workflow).toContain(
      "(github.event_name == 'push' && github.ref == 'refs/heads/main')"
    );
    expect(workflow).toContain("needs: verify");
    expect(workflow).toContain("EXPECTED_COMMIT: ${{ github.sha }}");
    expect(workflow).toContain("sourceCommit");
    expect(workflow).not.toContain("/api/v1/deployments/");
  });
});
