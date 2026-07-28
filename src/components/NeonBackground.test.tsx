import { describe, expect, it } from "vitest";
import { buildTendrils } from "./NeonBackground";

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
