import { useCallback, useEffect, useState } from "react";

export type AppRoute =
  | { name: "home" }
  | { name: "profile"; profileId: string }
  | { name: "story"; storyId: string };

const DEFAULT_BASE_PATH = import.meta.env.BASE_URL ?? "/";

function decodePathPart(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return "";
  }
}

function getCurrentPathname() {
  return typeof window === "undefined" ? "/" : window.location.pathname;
}

function normalizeBasePath(basePath: string) {
  if (!basePath || basePath === "/") {
    return "/";
  }

  const withLeadingSlash = basePath.startsWith("/") ? basePath : `/${basePath}`;

  return withLeadingSlash.endsWith("/")
    ? withLeadingSlash
    : `${withLeadingSlash}/`;
}

function stripBasePath(pathname: string, basePath: string) {
  const normalizedBasePath = normalizeBasePath(basePath);

  if (normalizedBasePath === "/") {
    return pathname;
  }

  const baseWithoutTrailingSlash = normalizedBasePath.slice(0, -1);

  if (pathname === baseWithoutTrailingSlash || pathname === normalizedBasePath) {
    return "/";
  }

  if (pathname.startsWith(normalizedBasePath)) {
    return `/${pathname.slice(normalizedBasePath.length)}`;
  }

  return pathname;
}

function addBasePath(pathname: string, basePath: string) {
  const normalizedBasePath = normalizeBasePath(basePath);

  if (normalizedBasePath === "/") {
    return pathname;
  }

  if (pathname === "/") {
    return normalizedBasePath;
  }

  return `${normalizedBasePath.slice(0, -1)}${pathname}`;
}

export function parseAppRoute(
  pathname: string,
  basePath = DEFAULT_BASE_PATH
): AppRoute {
  const parts = stripBasePath(pathname, basePath).split("/").filter(Boolean);

  if (parts.length === 0) {
    return { name: "home" };
  }

  if (parts.length === 2 && parts[0] === "profiles") {
    const profileId = decodePathPart(parts[1]);

    return profileId ? { name: "profile", profileId } : { name: "home" };
  }

  if (parts.length === 2 && parts[0] === "stories") {
    const storyId = decodePathPart(parts[1]);

    return storyId ? { name: "story", storyId } : { name: "home" };
  }

  return { name: "home" };
}

export function formatAppRoute(route: AppRoute, basePath = DEFAULT_BASE_PATH) {
  if (route.name === "profile") {
    return addBasePath(
      `/profiles/${encodeURIComponent(route.profileId)}`,
      basePath
    );
  }

  if (route.name === "story") {
    return addBasePath(`/stories/${encodeURIComponent(route.storyId)}`, basePath);
  }

  return addBasePath("/", basePath);
}

export function useAppRoute() {
  const [route, setRoute] = useState<AppRoute>(() =>
    parseAppRoute(getCurrentPathname())
  );

  useEffect(() => {
    const currentRoute = parseAppRoute(getCurrentPathname());
    const normalizedPath = formatAppRoute(currentRoute);

    if (normalizedPath !== getCurrentPathname()) {
      window.history.replaceState(null, "", normalizedPath);
    }

    setRoute(currentRoute);

    const handlePopState = () => {
      setRoute(parseAppRoute(getCurrentPathname()));
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const commitRoute = useCallback((nextRoute: AppRoute, mode: "push" | "replace") => {
    const nextPath = formatAppRoute(nextRoute);

    if (nextPath !== getCurrentPathname()) {
      if (mode === "replace") {
        window.history.replaceState(null, "", nextPath);
      } else {
        window.history.pushState(null, "", nextPath);
      }
    }

    setRoute(nextRoute);
  }, []);

  const navigate = useCallback(
    (nextRoute: AppRoute) => commitRoute(nextRoute, "push"),
    [commitRoute]
  );
  const replace = useCallback(
    (nextRoute: AppRoute) => commitRoute(nextRoute, "replace"),
    [commitRoute]
  );

  return { navigate, replace, route };
}
