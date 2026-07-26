import { createServer } from "node:http";
import { createRequestHandler } from "./httpServer";

const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const host = process.env.HOST ?? "0.0.0.0";
const handleRequest = createRequestHandler();

const server = createServer(handleRequest);

server.listen(port, host, () => {
  console.log(`Chatsim listening on http://${host}:${port}`);
});
