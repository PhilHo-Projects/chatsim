import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProfileAvatar } from "./ProfileAvatar";

describe("ProfileAvatar", () => {
  it("renders the selected full preset as decorative inline SVG", () => {
    const { container } = render(<ProfileAvatar presetId="waving" />);
    const svg = container.querySelector("svg");

    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveAttribute("data-avatar-preset", "waving");
    expect(svg).toHaveAttribute("data-avatar-variant", "full");
    expect(svg).toHaveAttribute("viewBox", "0 0 300 400");
    expect(svg?.querySelectorAll("path").length).toBeGreaterThan(4);
    expect(svg?.querySelector("filter, animate, animateTransform")).toBeNull();
  });

  it("renders a square, heavier compact variant", () => {
    const { container } = render(
      <ProfileAvatar compact presetId="sitting" />
    );
    const svg = container.querySelector("svg");
    const strokes = [
      ...(svg?.querySelectorAll("[data-figure-stroke]") ?? [])
    ];

    expect(svg).toHaveAttribute("data-avatar-variant", "compact");
    expect(svg).toHaveAttribute("viewBox", "0 45 300 300");
    expect(
      strokes.every(
        (stroke) => Number(stroke.getAttribute("stroke-width")) >= 7
      )
    ).toBe(true);
  });
});
