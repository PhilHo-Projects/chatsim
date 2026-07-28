import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAppRoute } from "./appRoute";

function RouteHarness() {
  const { navigate, route } = useAppRoute();

  return (
    <>
      <output aria-label="Current route">
        {route.name === "profile" ? route.profileId : route.name}
      </output>
      <button
        type="button"
        onClick={() =>
          navigate({ name: "profile", profileId: "user-phil" })
        }
      >
        Open profile
      </button>
    </>
  );
}

describe("app route navigation", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("starts forward in-app navigation at the top of the next route", () => {
    let scrollY = 240;

    vi.stubGlobal(
      "scrollTo",
      (options?: ScrollToOptions | number, y?: number) => {
        scrollY =
          typeof options === "number" ? (y ?? 0) : (options?.top ?? 0);
      }
    );

    render(<RouteHarness />);
    fireEvent.click(screen.getByRole("button", { name: "Open profile" }));

    expect(window.location.pathname).toBe("/profiles/user-phil");
    expect(screen.getByLabelText("Current route")).toHaveTextContent(
      "user-phil"
    );
    expect(scrollY).toBe(0);
  });

  it("leaves popstate scroll restoration to the browser", () => {
    let scrollY = 180;

    vi.stubGlobal(
      "scrollTo",
      (options?: ScrollToOptions | number, y?: number) => {
        scrollY =
          typeof options === "number" ? (y ?? 0) : (options?.top ?? 0);
      }
    );

    render(<RouteHarness />);

    act(() => {
      window.history.pushState(null, "", "/profiles/user-phil");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    expect(screen.getByLabelText("Current route")).toHaveTextContent(
      "user-phil"
    );
    expect(scrollY).toBe(180);
  });
});
