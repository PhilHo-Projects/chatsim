import {
  createReadStream,
  existsSync,
  statSync
} from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  extname,
  join,
  normalize,
  resolve,
  sep
} from "node:path";
import { createApiHandler } from "./api";
import { StoryStore } from "./storyStore";

type RequestHandlerOptions = {
  basePath?: string;
  distDir?: string;
  store?: StoryStore;
};

const MIME_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp"
};

function normalizeBasePath(basePath: string | undefined) {
  if (!basePath || basePath === "/") {
    return "/";
  }

  const withLeadingSlash = basePath.startsWith("/") ? basePath : `/${basePath}`;

  return withLeadingSlash.endsWith("/")
    ? withLeadingSlash.slice(0, -1)
    : withLeadingSlash;
}

function getPathUnderBase(pathname: string, basePath: string) {
  if (basePath === "/") {
    return pathname;
  }

  if (pathname === basePath) {
    return "/";
  }

  if (pathname.startsWith(`${basePath}/`)) {
    return pathname.slice(basePath.length);
  }

  return null;
}

function sendJsonNotFound(response: ServerResponse) {
  response.writeHead(404, {
    "Content-Type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify({ error: "Not found." }));
}

function sendRedirect(response: ServerResponse, location: string) {
  response.writeHead(301, { Location: location });
  response.end();
}

function isInsideDirectory(root: string, candidate: string) {
  const relative = normalize(candidate).slice(root.length);

  return candidate === root || relative.startsWith(sep);
}

function resolveStaticFile(distDir: string, requestPath: string) {
  let decodedPath = "/";

  try {
    decodedPath = decodeURIComponent(requestPath);
  } catch {
    return null;
  }

  const relativePath = decodedPath === "/" ? "index.html" : decodedPath.slice(1);
  const candidate = resolve(distDir, relativePath);

  if (!isInsideDirectory(distDir, candidate)) {
    return null;
  }

  if (existsSync(candidate) && statSync(candidate).isFile()) {
    return candidate;
  }

  return null;
}

function sendStaticFile(
  request: IncomingMessage,
  response: ServerResponse,
  filePath: string
) {
  const extension = extname(filePath).toLowerCase();

  response.writeHead(200, {
    "Content-Type": MIME_TYPES[extension] ?? "application/octet-stream"
  });

  if (request.method === "HEAD") {
    response.end();
    return;
  }

  createReadStream(filePath).pipe(response);
}

function withStrippedRequestUrl<T>(
  request: IncomingMessage,
  strippedPath: string,
  run: () => Promise<T>
) {
  const originalUrl = request.url;
  const original = new URL(originalUrl ?? "/", "http://localhost");

  request.url = `${strippedPath}${original.search}`;

  return run().finally(() => {
    request.url = originalUrl;
  });
}

export function createRequestHandler(options: RequestHandlerOptions = {}) {
  const basePath = normalizeBasePath(options.basePath);
  const distDir = resolve(options.distDir ?? join(process.cwd(), "dist"));
  const indexFile = join(distDir, "index.html");
  const handleApiRequest = createApiHandler({ store: options.store });

  return async function handleRequest(
    request: IncomingMessage,
    response: ServerResponse
  ) {
    const url = new URL(request.url ?? "/", "http://localhost");

    if (basePath !== "/" && url.pathname === basePath) {
      sendRedirect(response, `${basePath}/${url.search}`);
      return;
    }

    const pathUnderBase = getPathUnderBase(url.pathname, basePath);

    if (pathUnderBase === null) {
      sendJsonNotFound(response);
      return;
    }

    if (pathUnderBase.startsWith("/api")) {
      const handled = await withStrippedRequestUrl(request, pathUnderBase, () =>
        handleApiRequest(request, response)
      );

      if (handled) {
        return;
      }
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      sendJsonNotFound(response);
      return;
    }

    const staticFile = resolveStaticFile(distDir, pathUnderBase);

    if (staticFile) {
      sendStaticFile(request, response, staticFile);
      return;
    }

    if (extname(pathUnderBase)) {
      sendJsonNotFound(response);
      return;
    }

    sendStaticFile(request, response, indexFile);
  };
}
