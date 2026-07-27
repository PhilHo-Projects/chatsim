import {
  createReadStream,
  existsSync,
  statSync,
  type Stats
} from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  basename,
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
  store?: Promise<StoryStore> | StoryStore;
};

const MIME_TYPES: Record<string, string> = {
  ".avif": "image/avif",
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
  ".woff2": "font/woff2"
};

const IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable";
const REVALIDATE_CACHE_CONTROL = "no-cache";

// Vite emits `name-<8 char base64url hash>.ext` for everything under
// `dist/assets`. Those URLs change whenever the bytes change, so they can be
// cached for a year. Anything else has to be revalidated on every load.
const HASHED_ASSET_NAME = /-[A-Za-z0-9_-]{8}\.[A-Za-z0-9]+$/;

const PRECOMPRESSED_EXTENSIONS = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".svg",
  ".txt"
]);

type StaticEncoding = {
  filePath: string;
  stats: Stats;
  contentEncoding: string | null;
};

function isCacheableForever(filePath: string) {
  return HASHED_ASSET_NAME.test(basename(filePath));
}

function buildEntityTag(stats: Stats) {
  return `W/"${stats.size.toString(16)}-${stats.mtimeMs.toString(16)}"`;
}

function acceptsEncoding(request: IncomingMessage, encoding: string) {
  const header = request.headers["accept-encoding"];

  if (!header) {
    return false;
  }

  const value = Array.isArray(header) ? header.join(",") : header;

  return value
    .split(",")
    .some((entry) => entry.trim().split(";")[0].toLowerCase() === encoding);
}

// The build step writes `.br`/`.gz` siblings next to compressible assets, so
// the runtime never has to spend CPU compressing the same bytes again.
function resolveEncoding(
  request: IncomingMessage,
  filePath: string,
  stats: Stats
): StaticEncoding {
  if (!PRECOMPRESSED_EXTENSIONS.has(extname(filePath).toLowerCase())) {
    return { filePath, stats, contentEncoding: null };
  }

  for (const [encoding, suffix] of [
    ["br", ".br"],
    ["gzip", ".gz"]
  ] as const) {
    if (!acceptsEncoding(request, encoding)) {
      continue;
    }

    const candidate = `${filePath}${suffix}`;

    if (existsSync(candidate)) {
      return {
        filePath: candidate,
        stats: statSync(candidate),
        contentEncoding: encoding
      };
    }
  }

  return { filePath, stats, contentEncoding: null };
}

function isFresh(request: IncomingMessage, entityTag: string) {
  const ifNoneMatch = request.headers["if-none-match"];

  if (!ifNoneMatch) {
    return false;
  }

  return ifNoneMatch
    .split(",")
    .some((candidate) => candidate.trim() === entityTag);
}

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

  let stats: Stats;

  try {
    stats = statSync(filePath);
  } catch {
    sendJsonNotFound(response);
    return;
  }

  const encoded = resolveEncoding(request, filePath, stats);
  const entityTag = buildEntityTag(encoded.stats);
  const cacheControl = isCacheableForever(filePath)
    ? IMMUTABLE_CACHE_CONTROL
    : REVALIDATE_CACHE_CONTROL;

  const headers: Record<string, string> = {
    "Cache-Control": cacheControl,
    "Content-Type": MIME_TYPES[extension] ?? "application/octet-stream",
    ETag: entityTag,
    "Last-Modified": encoded.stats.mtime.toUTCString()
  };

  if (encoded.contentEncoding) {
    headers["Content-Encoding"] = encoded.contentEncoding;
    headers.Vary = "Accept-Encoding";
  }

  if (isFresh(request, entityTag)) {
    response.writeHead(304, headers);
    response.end();
    return;
  }

  headers["Content-Length"] = String(encoded.stats.size);

  response.writeHead(200, headers);

  if (request.method === "HEAD") {
    response.end();
    return;
  }

  createReadStream(encoded.filePath).pipe(response);
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
