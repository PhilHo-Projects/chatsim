// Pre-compresses the built app's text assets so the production HTTP server can
// stream a ready-made `.br`/`.gz` sibling instead of compressing per request.
import { createReadStream, createWriteStream } from "node:fs";
import { readdir, stat, unlink } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import {
  constants,
  createBrotliCompress,
  createGzip
} from "node:zlib";

const COMPRESSIBLE_EXTENSIONS = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".svg",
  ".txt"
]);

// Below this size the transfer is dominated by round trips, not bytes.
const MINIMUM_SIZE_BYTES = 1024;

async function* walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      yield* walk(path);
      continue;
    }

    if (entry.isFile()) {
      yield path;
    }
  }
}

function createCompressor(encoding, sizeBytes) {
  if (encoding === "br") {
    return createBrotliCompress({
      params: {
        [constants.BROTLI_PARAM_QUALITY]: 11,
        [constants.BROTLI_PARAM_SIZE_HINT]: sizeBytes
      }
    });
  }

  return createGzip({ level: 9 });
}

async function compress(filePath, sizeBytes, encoding, suffix) {
  const target = `${filePath}${suffix}`;

  await pipeline(
    createReadStream(filePath),
    createCompressor(encoding, sizeBytes),
    createWriteStream(target)
  );

  const compressed = await stat(target);

  // A compressed copy that is not smaller only costs the server a stat call.
  if (compressed.size >= sizeBytes) {
    await unlink(target);
    return null;
  }

  return compressed.size;
}

async function main() {
  const distDir = resolve(process.argv[2] ?? "dist");
  let originalBytes = 0;
  let brotliBytes = 0;
  let fileCount = 0;

  for await (const filePath of walk(distDir)) {
    const extension = extname(filePath).toLowerCase();

    if (!COMPRESSIBLE_EXTENSIONS.has(extension)) {
      continue;
    }

    const { size } = await stat(filePath);

    if (size < MINIMUM_SIZE_BYTES) {
      continue;
    }

    const brotliSize = await compress(filePath, size, "br", ".br");
    await compress(filePath, size, "gzip", ".gz");

    fileCount += 1;
    originalBytes += size;
    brotliBytes += brotliSize ?? size;
  }

  const toKilobytes = (bytes) => `${Math.round(bytes / 1024)} KB`;

  console.log(
    `compress-dist: ${fileCount} files, ${toKilobytes(originalBytes)} -> ` +
      `${toKilobytes(brotliBytes)} brotli`
  );
}

await main();
