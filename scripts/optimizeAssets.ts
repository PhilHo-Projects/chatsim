// Re-encodes the bundled application artwork as WebP at the largest size any
// surface actually renders. The source PNGs were full-resolution exports, so
// every visitor was downloading megabytes to paint a card a few hundred pixels
// wide. Rerun with `npm run assets:optimize` after adding new artwork.
import { readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import sharp from "sharp";

type OptimizeTarget = {
  // Directory relative to `src/assets`, or a single file path.
  path: string;
  // Longest edge the rendered surface can need, including a 2x device ratio.
  maxWidth: number;
  quality: number;
};

const ASSETS_DIR = resolve("src/assets");
const SOURCE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

// Some artwork only exists as WebP, so it is re-encoded in place. Recording
// each result keeps reruns idempotent instead of stacking lossy generations.
const LEDGER_PATH = resolve("scripts/optimizedAssets.json");

type Ledger = Record<string, number>;

async function readLedger(): Promise<Ledger> {
  try {
    return JSON.parse(await readFile(LEDGER_PATH, "utf8")) as Ledger;
  } catch {
    return {};
  }
}

function ledgerKey(filePath: string) {
  return relative(ASSETS_DIR, filePath).split("\\").join("/");
}

const TARGETS: OptimizeTarget[] = [
  // Full-viewport backgrounds painted behind the whole shell.
  { path: "coffee-shop-background.png", maxWidth: 1920, quality: 78 },
  // Default speaker avatars: rendered at chat-bubble and preview sizes only.
  { path: "maya-anime-avatar.png", maxWidth: 512, quality: 82 },
  { path: "mystery-speaker-avatar.png", maxWidth: 512, quality: 82 },
  // Masonry covers. The widest rendered column is ~230px on a 1280px desktop
  // and ~180px on a two-column phone, so 640px still covers a 3x device ratio.
  { path: "story-card-backgrounds/story-covers", maxWidth: 640, quality: 78 }
];

async function collectSources(target: OptimizeTarget) {
  const absolute = join(ASSETS_DIR, target.path);
  const stats = await stat(absolute);

  if (stats.isFile()) {
    return [absolute];
  }

  const entries = await readdir(absolute, { withFileTypes: true });
  const names = new Set(entries.map((entry) => entry.name));

  return entries
    .filter((entry) => {
      if (!entry.isFile()) {
        return false;
      }

      const extension = extname(entry.name).toLowerCase();

      if (!SOURCE_EXTENSIONS.has(extension)) {
        return false;
      }

      // A WebP sitting beside a PNG of the same name is this script's output.
      return (
        extension !== ".webp" ||
        !names.has(`${basename(entry.name, extension)}.png`)
      );
    })
    .map((entry) => join(absolute, entry.name));
}

function toKilobytes(bytes: number) {
  return `${Math.round(bytes / 1024)} KB`;
}

async function optimize(sourcePath: string, target: OptimizeTarget) {
  const destination = join(
    dirname(sourcePath),
    `${basename(sourcePath, extname(sourcePath))}.webp`
  );

  // Read up front so no libvips file handle is left on a path that is about to
  // be replaced, and so the original size survives an in-place re-encode.
  const source = await readFile(sourcePath);
  const before = source.length;
  const image = sharp(source).rotate();
  const metadata = await image.metadata();
  const width = metadata.width ?? target.maxWidth;

  const output = await image
    .resize({
      width: Math.min(width, target.maxWidth),
      withoutEnlargement: true
    })
    .webp({ effort: 6, quality: target.quality })
    .toBuffer();

  // Written through a temporary file so an in-place re-encode never opens the
  // same path for reading and writing at once.
  const temporary = `${destination}.optimizing`;

  await writeFile(temporary, output);
  await rename(temporary, destination);

  return { destination, before, after: output.length };
}

async function main() {
  const ledger = await readLedger();
  let totalBefore = 0;
  let totalAfter = 0;
  let skipped = 0;

  for (const target of TARGETS) {
    for (const sourcePath of await collectSources(target)) {
      const key = ledgerKey(sourcePath);

      if (ledger[key] === (await stat(sourcePath)).size) {
        skipped += 1;
        continue;
      }

      const { destination, before, after } = await optimize(sourcePath, target);

      ledger[ledgerKey(destination)] = after;
      totalBefore += before;
      totalAfter += after;

      console.log(
        `${toKilobytes(before).padStart(8)} -> ${toKilobytes(after).padStart(8)}` +
          `  ${destination.slice(ASSETS_DIR.length + 1)}`
      );
    }
  }

  await writeFile(LEDGER_PATH, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");

  if (skipped > 0) {
    console.log(`skipped ${skipped} already-optimized files`);
  }

  console.log(
    `\ntotal: ${toKilobytes(totalBefore)} -> ${toKilobytes(totalAfter)}`
  );
}

await main();
