import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import type { Plugin } from "vite";
import { createApiHandler } from "./server/api";

function chatsimApiPlugin(): Plugin {
  return {
    name: "chatsim-local-api",
    configureServer(server) {
      const handleApiRequest = createApiHandler();

      server.middlewares.use((request, response, next) => {
        void handleApiRequest(request, response)
          .then((handled) => {
            if (!handled) {
              next();
            }
          })
          .catch(next);
      });
    }
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), chatsimApiPlugin()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.ts"
  }
});
