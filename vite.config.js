import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { createApiHandler } from "./server/api";
function chatsimApiPlugin() {
    return {
        name: "chatsim-local-api",
        configureServer: function (server) {
            var handleApiRequest = createApiHandler();
            server.middlewares.use(function (request, response, next) {
                void handleApiRequest(request, response)
                    .then(function (handled) {
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
    plugins: [react(), chatsimApiPlugin()],
    test: {
        environment: "jsdom",
        globals: true,
        setupFiles: "./src/test/setup.ts"
    }
});
