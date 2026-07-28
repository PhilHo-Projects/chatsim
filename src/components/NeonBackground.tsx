import { createSeededRandom } from "../utils/seededRandom";

/** Tendril count and node count are fixed by the design spec. */
const TENDRIL_COUNT = 22;
const NODE_COUNT = 26;

/** Fixed seed, so the field is identical on every load and in every snapshot. */
const SEED = "chatsim-tendrils-v2";

const NEON = [
  "var(--neon-1)",
  "var(--neon-2)",
  "var(--neon-3)",
  "var(--neon-4)"
] as const;

export type Tendril = {
  color: string;
  d: string;
  dash: number;
  delay: number;
  duration: number;
  width: number;
};

/**
 * A smooth cubic chain crossing the full width. `amp` scales the vertical
 * wander, so some read as taut filaments and others as slack loops.
 */
function tendrilPath(next: () => number, startY: number, amp: number) {
  const segments = 4 + Math.floor(next() * 3);
  const step = 1800 / segments;
  let d = `M-100,${startY.toFixed(0)}`;
  let x = -100;
  let y = startY;
  let direction = next() > 0.5 ? 1 : -1;

  for (let index = 0; index < segments; index += 1) {
    const nextX = x + step;
    const nextY = y + direction * amp * (0.5 + next());

    d +=
      ` C${(x + step * 0.4).toFixed(0)},${(y + direction * amp * 0.9).toFixed(0)}` +
      ` ${(nextX - step * 0.4).toFixed(0)},${(nextY - direction * amp * 0.9).toFixed(0)}` +
      ` ${nextX.toFixed(0)},${nextY.toFixed(0)}`;

    x = nextX;
    y = nextY;
    direction *= -1;
  }

  return d;
}

export function buildTendrils(count: number): Tendril[] {
  const next = createSeededRandom(SEED);

  return Array.from({ length: count }, () => {
    const startY = -60 + next() * 1020;
    const amp = 40 + next() * 150;

    return {
      color: NEON[Math.floor(next() * NEON.length)],
      d: tendrilPath(next, startY, amp),
      dash: 160 + Math.floor(next() * 420),
      delay: -next() * 40,
      duration: 16 + next() * 34,
      width: 0.7 + next() * 1.1
    };
  });
}

function buildNodes(count: number) {
  const next = createSeededRandom(`${SEED}-nodes`);

  return Array.from({ length: count }, (_unused, index) => ({
    color: NEON[Math.floor(next() * NEON.length)],
    cx: Math.round(next() * 1600),
    cy: Math.round(next() * 900),
    delay: -next() * 9,
    duration: 4 + next() * 7,
    key: `node-${index}`,
    r: 1.2 + next() * 2.6
  }));
}

/**
 * Two copies of the same geometry: a thick blurred copy for the glow, a thin
 * bright copy in plus-lighter for the filament core. The blur lives on the
 * layer and is never recomputed; only transform and stroke-dashoffset animate.
 */
export function NeonBackground() {
  const tendrils = buildTendrils(TENDRIL_COUNT);
  const nodes = buildNodes(NODE_COUNT);

  return (
    <div aria-hidden="true" className="neon-bg">
      <div className="neon-bg__blooms" />
      <svg
        className="neon-bg__glow"
        preserveAspectRatio="xMidYMid slice"
        viewBox="0 0 1600 900"
      >
        {tendrils.map((tendril, index) => (
          <path
            key={`glow-${index}`}
            d={tendril.d}
            fill="none"
            stroke={tendril.color}
            strokeLinecap="round"
            strokeWidth={tendril.width * 3.6}
          />
        ))}
      </svg>
      <svg
        className="neon-bg__core"
        preserveAspectRatio="xMidYMid slice"
        viewBox="0 0 1600 900"
      >
        {tendrils.map((tendril, index) => (
          <path
            key={`core-${index}`}
            d={tendril.d}
            fill="none"
            stroke={tendril.color}
            strokeDasharray={`${tendril.dash} ${tendril.dash * 4}`}
            strokeLinecap="round"
            strokeWidth={tendril.width}
            style={{
              animation: `neon-flow ${tendril.duration.toFixed(1)}s linear ${tendril.delay.toFixed(1)}s infinite`
            }}
          />
        ))}
        {nodes.map((node) => (
          <circle
            key={node.key}
            cx={node.cx}
            cy={node.cy}
            fill={node.color}
            r={node.r}
            style={{
              animation: `neon-pulse ${node.duration.toFixed(1)}s ease-in-out ${node.delay.toFixed(1)}s infinite`
            }}
          />
        ))}
      </svg>
      <div className="neon-bg__vignette" />
    </div>
  );
}
