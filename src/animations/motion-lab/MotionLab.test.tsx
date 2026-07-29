import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MotionLab } from "./MotionLab";

afterEach(() => {
  Reflect.deleteProperty(HTMLElement.prototype, "getAnimations");
});

describe("motion lab", () => {
  it("renders the real motion modules and returns to the app", () => {
    const onBack = vi.fn();

    render(<MotionLab onBack={onBack} />);

    expect(
      screen.getByRole("heading", { name: "Motion lab" })
    ).toBeVisible();
    expect(screen.getByText("Neon tendrils")).toBeVisible();
    expect(screen.getByText("Conversation motion")).toBeVisible();
    expect(screen.getByText("Battle motion")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Pause animations" })
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Set animation speed to 2x" })
    ).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Back to app" }));

    expect(onBack).toHaveBeenCalledOnce();
  });

  it("scopes pause and playback rate changes to lab animations", () => {
    const animation = {
      pause: vi.fn(),
      play: vi.fn(),
      playbackRate: 1
    };

    Object.defineProperty(HTMLElement.prototype, "getAnimations", {
      configurable: true,
      value: () => [animation]
    });

    render(<MotionLab onBack={() => undefined} />);

    fireEvent.click(screen.getByRole("button", { name: "Pause animations" }));
    expect(animation.pause).toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole("button", { name: "Set animation speed to 2x" })
    );
    expect(animation.playbackRate).toBe(2);
  });

  it("falls back to scoped CSS controls without the Web Animations API", () => {
    const { container } = render(<MotionLab onBack={() => undefined} />);
    const firstLayer = container.querySelector<SVGElement>(
      ".neon-bg__edge--left-near"
    );

    expect(firstLayer).not.toBeNull();
    firstLayer!.style.animationDuration = "18s";

    fireEvent.click(screen.getByRole("button", { name: "Pause animations" }));
    expect(firstLayer?.style.animationPlayState).toBe("paused");

    fireEvent.click(
      screen.getByRole("button", { name: "Set animation speed to 2x" })
    );
    expect(firstLayer?.style.animationDuration).toBe("9s");
  });
});
