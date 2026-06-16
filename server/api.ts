import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { createFetchApiHandler, type StoryApiStore } from "./apiFetch";
import { StoryStore } from "./storyStore";

type ApiHandlerOptions = {
  store?: StoryApiStore;
};

function nodeRequestUrl(request: IncomingMessage) {
  return new URL(request.url ?? "/", "http://localhost").toString();
}

function nodeRequestHeaders(request: IncomingMessage) {
  const headers = new Headers();

  for (const [name, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) {
      for (const entry of value) {
        headers.append(name, entry);
      }
    } else if (value !== undefined) {
      headers.set(name, value);
    }
  }

  return headers;
}

function toFetchRequest(request: IncomingMessage) {
  const method = request.method ?? "GET";
  const init: RequestInit & { duplex?: "half" } = {
    headers: nodeRequestHeaders(request),
    method
  };

  if (method !== "GET" && method !== "HEAD") {
    init.body = Readable.toWeb(request) as ReadableStream;
    init.duplex = "half";
  }

  return new Request(nodeRequestUrl(request), init);
}

async function writeFetchResponse(
  response: ServerResponse,
  fetchResponse: Response
) {
  const headers: Record<string, string> = {};

  fetchResponse.headers.forEach((value, name) => {
    headers[name] = value;
  });

  response.writeHead(fetchResponse.status, headers);
  response.end(Buffer.from(await fetchResponse.arrayBuffer()));
}

export function createApiHandler(options: ApiHandlerOptions = {}) {
  const store = options.store ?? StoryStore.open();
  const handleApiRequest = createFetchApiHandler({ store });

  return async function handleNodeApiRequest(
    request: IncomingMessage,
    response: ServerResponse
  ) {
    const fetchResponse = await handleApiRequest(toFetchRequest(request));

    if (!fetchResponse) {
      return false;
    }

    await writeFetchResponse(response, fetchResponse);
    return true;
  };
}
