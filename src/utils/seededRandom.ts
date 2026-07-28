/**
 * FNV-1a derived generator. Deterministic for a given seed, so generated
 * geometry is identical on every load and in every test snapshot rather
 * than changing per render.
 */
export function createSeededRandom(seed: string): () => number {
  let hash = 2166136261;

  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return () => {
    hash = Math.imul(hash ^ (hash >>> 15), 2246822507);
    return ((hash >>> 0) % 100000) / 100000;
  };
}
