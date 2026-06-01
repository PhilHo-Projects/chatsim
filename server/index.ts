import { createServer } from "node:http";
import { createApiHandler } from "./api";

const port = Number.parseInt(process.env.CHATSIM_API_PORT ?? "8787", 10);
const handleApiRequest = createApiHandler();

const server = createServer(async (request, response) => {
  const handled = await handleApiRequest(request, response);

  if (!handled) {
    response.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: "Not found." }));
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Chatsim API listening on http://127.0.0.1:${port}`);
});
