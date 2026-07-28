import { describe, expect, it } from "vitest";
import { buildNodes, buildTendrils } from "./NeonBackground";

const NEON = [
  "var(--neon-1)",
  "var(--neon-2)",
  "var(--neon-3)",
  "var(--neon-4)"
];

describe("neon background geometry", () => {
  it("is deterministic across calls", () => {
    expect(buildTendrils(22)).toEqual(buildTendrils(22));
  });

  it("builds the requested number of tendrils", () => {
    expect(buildTendrils(22)).toHaveLength(22);
    expect(buildTendrils(11)).toHaveLength(11);
  });

  it("only uses the four neon tokens", () => {
    for (const tendril of buildTendrils(22)) {
      expect(NEON).toContain(tendril.color);
    }
  });

  it("emits parseable path data", () => {
    for (const tendril of buildTendrils(22)) {
      expect(tendril.d).toMatch(/^M-100,-?\d+(\.\d+)?( C[-\d., ]+)+$/);
    }
  });
});

describe("neon background node density", () => {
  it("is deterministic across calls", () => {
    expect(buildNodes(26)).toEqual(buildNodes(26));
  });

  it("builds the requested number of nodes", () => {
    expect(buildNodes(26)).toHaveLength(26);
    expect(buildNodes(13)).toHaveLength(13);
  });

  it("only uses the four neon tokens", () => {
    for (const node of buildNodes(26)) {
      expect(NEON).toContain(node.color);
    }
  });

  it("does not share generator state with buildTendrils", () => {
    const nodesBefore = buildNodes(26);
    buildTendrils(22);
    expect(buildNodes(26)).toEqual(nodesBefore);

    const tendrilsBefore = buildTendrils(22);
    buildNodes(26);
    expect(buildTendrils(22)).toEqual(tendrilsBefore);
  });
});
