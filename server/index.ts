import { createServer } from "node:http";
import { createRequestHandler } from "./httpServer";
import { createApplicationRuntime } from "./runtime";

const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const host = process.env.HOST ?? "0.0.0.0";

async function main() {
  const runtime = await createApplicationRuntime();
  const server = createServer(createRequestHandler({ runtime }));

  server.listen(port, host, () => {
    console.log(`Chatsim listening on http://${host}:${port}`);
  });

  const shutdown = () => {
    server.close(() => {
      void runtime.close().finally(() => process.exit(0));
    });
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "Chatsim failed to start."
  );
  process.exitCode = 1;
});
