import { useEffect, useState } from "react";

/**
 * Tracks a CSS media query. Falls back to `fallback` (default true / "wide")
 * when `matchMedia` is unavailable — e.g. jsdom during tests — so layouts that
 * key off this render their full desktop form in that environment.
 */
export function useMediaQuery(query: string, fallback = true): boolean {
  const read = () =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia(query).matches
      : fallback;

  const [matches, setMatches] = useState<boolean>(read);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const mediaQueryList = window.matchMedia(query);
    const handleChange = () => setMatches(mediaQueryList.matches);

    handleChange();
    mediaQueryList.addEventListener?.("change", handleChange);

    return () => mediaQueryList.removeEventListener?.("change", handleChange);
  }, [query]);

  return matches;
}
