import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import type { Plugin } from "vite";
import { toNodeHandler } from "better-auth/node";
import { createApiHandler } from "./server/api";
import { createApplicationRuntime } from "./server/runtime";

function chatsimApiPlugin(): Plugin {
  return {
    name: "chatsim-local-api",
    async configureServer(server) {
      if (process.env.VITEST) {
        return;
      }

      const runtime = await createApplicationRuntime();
      const handleAuthRequest = toNodeHandler(runtime.authWebHandler);
      const handleApiRequest = createApiHandler({
        currentAccount: runtime.currentAccount,
        healthCheck: runtime.healthCheck,
        media: runtime.media,
        authConfig: runtime.authConfig,
        pool: runtime.pool,
        sender: runtime.sender,
        store: runtime.store
      });

      server.middlewares.use((request, response, next) => {
        const pathname = new URL(
          request.url ?? "/",
          "http://localhost"
        ).pathname;

        if (pathname.startsWith("/api/auth/")) {
          void handleAuthRequest(request, response).catch(next);
          return;
        }

        void handleApiRequest(request, response)
          .then((handled) => {
            if (!handled) {
              next();
            }
          })
          .catch(next);
      });
      server.httpServer?.once("close", () => {
        void runtime.close();
      });
    }
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), chatsimApiPlugin()],
  test: {
    environment: "jsdom",
    // Checked-out git worktrees carry a full copy of the suite. Running them
    // too races the real suite for the shared test database schemas.
    exclude: ["**/node_modules/**", "**/dist/**", "**/.worktrees/**"],
    globals: true,
    setupFiles: "./src/test/setup.ts",
    testTimeout: 20000
  }
});
