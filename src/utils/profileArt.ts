import { createSeededRandom } from "./seededRandom";

const NEON = [
  "var(--neon-1)",
  "var(--neon-2)",
  "var(--neon-3)",
  "var(--neon-4)"
] as const;

export type ArtStroke = {
  color: string;
  d: string;
  opacity: number;
  width: number;
};

export type ArtNode = {
  color: string;
  cx: number;
  cy: number;
  r: number;
};

export type ProfileArt = {
  nodes: ArtNode[];
  strokes: ArtStroke[];
  viewBox: string;
};

/**
 * Deterministic filament art for a handle, in the same visual language as the
 * background. Colours come only from the neon tokens, so generated art can
 * never introduce a colour the theme does not own.
 *
 * `compact` renders fewer, thicker lines into a square box for small avatars.
 */
export function buildProfileArt(
  handle: string,
  options: { compact?: boolean } = {}
): ProfileArt {
  const compact = options.compact === true;
  const next = createSeededRandom(`${handle}-art`);
  const lineCount = compact ? 3 : 6;
  const gap = compact ? 88 : 66;
  const strokes: ArtStroke[] = [];
  const nodes: ArtNode[] = [];

  for (let index = 0; index < lineCount; index += 1) {
    const y = 30 + index * gap + next() * 34;
    const color = NEON[Math.floor(next() * NEON.length)];
    const controlOneX = 40 + next() * 200;
    const controlTwoX = 60 + next() * 200;

    strokes.push({
      color,
      d:
        `M-20,${y.toFixed(0)}` +
        ` C${controlOneX.toFixed(0)},${(y - 80 + next() * 50).toFixed(0)}` +
        ` ${controlTwoX.toFixed(0)},${(y + 80 - next() * 50).toFixed(0)}` +
        ` 320,${(y + 24 - next() * 48).toFixed(0)}`,
      opacity: Number((0.45 + next() * 0.45).toFixed(2)),
      width: Number(((compact ? 4 : 0.8) + next() * 1.4).toFixed(2))
    });

    if (index % 2 === 0) {
      nodes.push({
        color,
        cx: Math.round(40 + next() * 220),
        cy: Math.round(y),
        r: Number(((compact ? 5 : 1.5) + next() * 2).toFixed(1))
      });
    }
  }

  return {
    nodes,
    strokes,
    viewBox: compact ? "0 0 300 300" : "0 0 300 400"
  };
}
