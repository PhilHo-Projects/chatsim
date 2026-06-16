import { createServer } from "node:http";
import { createRequestHandler } from "./httpServer";

const port = Number.parseInt(
  process.env.PORT ?? process.env.CHATSIM_API_PORT ?? "3000",
  10
);
const host = process.env.HOST ?? "0.0.0.0";
const basePath = process.env.CHATSIM_BASE_PATH ?? "/";
const handleRequest = createRequestHandler({ basePath });

const server = createServer(handleRequest);

server.listen(port, host, () => {
  console.log(`Chatsim listening on http://${host}:${port}${basePath}`);
});
