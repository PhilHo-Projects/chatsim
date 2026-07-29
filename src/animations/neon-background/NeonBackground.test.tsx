import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NeonBackground } from "./NeonBackground";

describe("lightweight neon background", () => {
  it("renders five hairline tendrils on each edge and eight sparks", () => {
    const { container } = render(<NeonBackground />);

    expect(container.querySelectorAll(".neon-bg__edge--left path")).toHaveLength(5);
    expect(container.querySelectorAll(".neon-bg__edge--right path")).toHaveLength(5);
    expect(container.querySelectorAll(".neon-bg__spark")).toHaveLength(8);
  });

  it("keeps animation off path geometry and uses no SVG filters", () => {
    const { container } = render(<NeonBackground />);

    expect(container.querySelector("filter, feGaussianBlur")).toBeNull();

    for (const path of container.querySelectorAll(".neon-bg path")) {
      expect(path).not.toHaveAttribute("style");
      expect(path).not.toHaveAttribute("stroke-dasharray");
      expect(path).toHaveAttribute("vector-effect", "non-scaling-stroke");
    }
  });
});
