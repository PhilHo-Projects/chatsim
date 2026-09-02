import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import App from "./App";
import {
  createBlankStoryboard,
  normalizeStoryboard
} from "./data/conversationConfig";
import {
  seedProfiles,
  seedStoryRecords,
  type PlatformProfile,
  type PlatformSession,
  type PlatformStoryRecord
} from "./data/platformSeed";

const ownerSession: PlatformSession = {
  expiresAt: "2026-08-24T12:00:00.000Z",
  user: {
    displayName: "phil",
    id: "user-phil",
    role: "member",
    username: "phil"
  }
};

const adminSession: PlatformSession = {
  expiresAt: "2026-08-24T12:00:00.000Z",
  user: {
    displayName: "admin",
    id: "user-admin",
    role: "admin",
    username: "admin"
  }
};

let mockProfiles: PlatformProfile[];
let mockSession: PlatformSession | null;
let mockStories: Record<string, PlatformStoryRecord>;
let failNextStoryDelete: boolean;
let failNextStoryUpdate: boolean;
let holdStoryUpdates: boolean;
let activeStoryUpdates: number;
let maxConcurrentStoryUpdates: number;
let pendingStoryUpdateReleases: Array<() => void>;
let storyCounter: number;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function toStoryCard(story: PlatformStoryRecord) {
  return {
    coverColor: story.coverColor,
    coverImage: story.coverImage ?? null,
    ownerId: story.ownerId,
    sceneCount: story.storyboard.scenes.length,
    storyId: story.id,
    title: story.title,
    updatedAt: story.updatedAt
  };
}

function createMockStory(
  ownerId: string,
  id: string,
  title: string,
  index: number
): PlatformStoryRecord {
  const storyboard = normalizeStoryboard({
    ...createBlankStoryboard(index),
    id,
    title
  });

  return {
    coverColor: "#22d3ee",
    createdAt: "2026-05-28T00:00:00.000Z",
    id,
    ownerId,
    storyboard,
    title,
    updatedAt: "2026-05-28T00:00:00.000Z",
    visibility: "public"
  };
}

function getProfilesFromStories() {
  return mockProfiles.map((profile) => ({
    ...profile,
    stories: Object.values(mockStories)
      .filter((story) => story.ownerId === profile.id)
      .map(toStoryCard)
  }));
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    headers: { "Content-Type": "application/json" },
    status
  });
}

function setupApiMock(session: PlatformSession | null = ownerSession) {
  mockProfiles = clone(seedProfiles);
  mockSession = session;
  mockStories = Object.fromEntries(
    seedStoryRecords.map((story) => [story.id, clone(story)])
  );
  failNextStoryDelete = false;
  failNextStoryUpdate = false;
  holdStoryUpdates = false;
  activeStoryUpdates = 0;
  maxConcurrentStoryUpdates = 0;
  pendingStoryUpdateReleases = [];
  storyCounter = seedStoryRecords.filter(
    (story) => story.ownerId === "user-phil"
  ).length;

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(
        typeof input === "string" ? input : input.toString(),
        "http://localhost"
      );
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : {};

      if (method === "GET" && url.pathname === "/api/profiles") {
        return jsonResponse({ profiles: getProfilesFromStories() });
      }

      if (method === "GET" && url.pathname === "/api/me") {
        return jsonResponse({
          account: mockSession
            ? {
                approvalStatus: "approved",
                disabled: false,
                email: `${mockSession.user.username}@example.com`,
                emailVerified: true,
                id: `auth-${mockSession.user.username}`,
                role: mockSession.user.role === "admin" ? "admin" : "user",
                username: mockSession.user.username
              }
            : null,
          profile: mockSession
            ? {
                accentColor: "#22d3ee",
                bio: null,
                displayName: mockSession.user.displayName,
                id: mockSession.user.id,
                username: mockSession.user.username
              }
            : null,
          registrationMode: "open",
          session: mockSession ? { expiresAt: mockSession.expiresAt } : null
        });
      }

      if (method === "GET" && url.pathname === "/api/admin/accounts") {
        return jsonResponse({ accounts: [] });
      }

      if (
        method === "POST" &&
        ["/api/auth/sign-in/email", "/api/auth/sign-in/username"].includes(
          url.pathname
        )
      ) {
        mockSession = ownerSession;
        return jsonResponse({
          redirect: false,
          token: null,
          user: {
            email: "phil@example.com",
            emailVerified: true,
            id: "auth-phil",
            name: "phil"
          }
        });
      }

      if (method === "POST" && url.pathname === "/api/auth/sign-up/email") {
        return jsonResponse({
          token: null,
          user: {
            email: body.email,
            emailVerified: false,
            id: `auth-${body.username}`,
            name: body.username
          }
        });
      }

      if (method === "POST" && url.pathname === "/api/auth/sign-out") {
        mockSession = null;
        return jsonResponse({ success: true });
      }

      const permissionsMatch = url.pathname.match(
        /^\/api\/stories\/([^/]+)\/permissions$/
      );

      if (permissionsMatch && method === "GET") {
        const story = mockStories[permissionsMatch[1]];
        const canManage =
          Boolean(story && mockSession) &&
          (mockSession?.user.role === "admin" ||
            mockSession?.user.id === story.ownerId);
        return jsonResponse({ canDelete: canManage, canEdit: canManage });
      }

      if (method === "POST" && url.pathname === "/api/stories") {
        if (!mockSession) {
          return jsonResponse({ error: "Sign in to create stories." }, 401);
        }

        storyCounter += 1;
        const storyId = `story-phil-${storyCounter}`;
        const title = storyCounter === 1 ? "Story" : `Story ${storyCounter}`;
        const storyboard = normalizeStoryboard({
          ...createBlankStoryboard(storyCounter - 1),
          id: storyId,
          title
        });
        const story: PlatformStoryRecord = {
          coverColor: "#22d3ee",
          createdAt: "2026-05-28T00:00:00.000Z",
          id: storyId,
          ownerId: mockSession.user.id,
          storyboard,
          title,
          updatedAt: "2026-05-28T00:00:00.000Z",
          visibility: "public"
        };

        mockStories[story.id] = story;
        return jsonResponse({ story }, 201);
      }

      const storyMatch = url.pathname.match(/^\/api\/stories\/([^/]+)$/);

      if (storyMatch && method === "GET") {
        const story = mockStories[storyMatch[1]];
        return story
          ? jsonResponse({ story })
          : jsonResponse({ error: "Story not found." }, 404);
      }

      if (storyMatch && method === "PUT") {
        activeStoryUpdates += 1;
        maxConcurrentStoryUpdates = Math.max(
          maxConcurrentStoryUpdates,
          activeStoryUpdates
        );

        try {
          if (holdStoryUpdates) {
            await new Promise<void>((resolve) => {
              pendingStoryUpdateReleases.push(resolve);
            });
          }

          if (failNextStoryUpdate) {
            failNextStoryUpdate = false;
            return jsonResponse({ error: "Could not save story." }, 500);
          }

          const currentStory = mockStories[storyMatch[1]];
          const story = {
            ...currentStory,
            ...body,
            id: currentStory.id,
            ownerId: currentStory.ownerId,
            storyboard: body.storyboard ?? currentStory.storyboard,
            updatedAt: "2026-05-28T00:00:00.000Z"
          } as PlatformStoryRecord;

          mockStories[story.id] = story;
          return jsonResponse({ story });
        } finally {
          activeStoryUpdates -= 1;
        }
      }

      if (storyMatch && method === "DELETE") {
        if (failNextStoryDelete) {
          failNextStoryDelete = false;
          return jsonResponse({ error: "Could not delete story." }, 500);
        }

        delete mockStories[storyMatch[1]];
        return jsonResponse({ ok: true });
      }

      return jsonResponse({ error: "Unhandled API route" }, 404);
    })
  );
}

async function flushPlatformEffects() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function flushQueuedStorySaves() {
  await act(async () => {
    for (let index = 0; index < 100; index += 1) {
      await Promise.resolve();
    }
  });
}

function setBrowserPath(pathname: string) {
  window.history.replaceState(null, "", pathname);
}

async function renderAppAtPath(pathname: string) {
  setBrowserPath(pathname);
  render(<App />);
  await flushPlatformEffects();
}

async function popTo(pathname: string) {
  await act(async () => {
    window.history.replaceState(null, "", pathname);
    window.dispatchEvent(new PopStateEvent("popstate"));
    await Promise.resolve();
  });
  await flushPlatformEffects();
}

function openProfileFromList(name: RegExp) {
  fireEvent.click(
    within(screen.getByLabelText("All profiles")).getByRole("button", { name })
  );
}

function openFirstStory() {
  if (!screen.queryByLabelText("Story bento grid")) {
    openProfileFromList(/Open @phil/);
  }
  fireEvent.click(
    within(screen.getByLabelText("Story bento grid")).getByRole("button", {
      name: /Ketamine prison 5 scenes/
    })
  );
}

async function renderAppOnStory(options: { waitForIntro?: boolean } = {}) {
  const { waitForIntro = true } = options;

  render(<App />);
  await flushPlatformEffects();
  openFirstStory();
  await flushPlatformEffects();

  if (waitForIntro) {
    act(() => {
      vi.advanceTimersByTime(1500);
    });
  }
}

async function renderEditorOnStory() {
  await renderAppOnStory();
  fireEvent.click(screen.getByRole("button", { name: "Open script editor" }));
}

describe("App", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("scrollTo", vi.fn());
    localStorage.clear();
    setBrowserPath("/");
    setupApiMock();
  });

  afterEach(async () => {
    await flushQueuedStorySaves();
    vi.unstubAllGlobals();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("opens the unlinked motion lab without the browsing directory", async () => {
    await renderAppAtPath("/motion-lab");

    expect(
      screen.getByRole("heading", { name: "Motion lab" })
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("All profiles")).not.toBeInTheDocument();
  });

  it("starts in a persistent browsing shell with a featured deck and profile list", async () => {
    mockSession = null;
    render(<App />);
    await flushPlatformEffects();

    expect(screen.getByLabelText("App shell")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "chatsim" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Desktop navigation" })).toHaveClass(
      "hidden",
      "md:flex"
    );
    expect(
      within(screen.getByRole("navigation", { name: "Desktop navigation" }))
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-label"))
    ).toEqual(["Home", "Explore", "Create story"]);
    expect(screen.getByRole("navigation", { name: "Mobile navigation" })).toHaveClass(
      "md:hidden"
    );
    expect(screen.getByRole("searchbox", { name: "Search profiles" })).toBeInTheDocument();
    const appShell = screen.getByRole("main").parentElement;

    expect(appShell).toHaveClass("app-background", "app-background--landing");
    expect(appShell).not.toHaveClass("app-background--story");
    expect(appShell).toHaveClass("overflow-x-clip");
    expect(appShell).not.toHaveClass("overflow-hidden");

    const desktopNav = screen.getByRole("navigation", {
      name: "Desktop navigation"
    });
    const mobileNav = screen.getByRole("navigation", {
      name: "Mobile navigation"
    });
    const topBar = appShell?.querySelector(".sticky.top-0");

    expect(desktopNav).not.toHaveClass("backdrop-blur-xl");
    expect(mobileNav).not.toHaveClass("backdrop-blur-xl");
    expect(topBar).not.toBeNull();
    expect(topBar).not.toHaveClass("backdrop-blur-xl");
    expect(screen.queryByText("choose a story")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Account settings" })).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "chatsim" }).parentElement
    ).toHaveClass("text-center");
    const browseGrid = screen
      .getByRole("heading", { name: "chatsim" })
      .closest("section");

    expect(browseGrid).toHaveClass("grid-cols-1");
    fireEvent.click(
      screen.getAllByRole("button", { name: "Account" })[0]
    );
    expect(screen.getByRole("dialog", { name: "Account panel" })).toBeInTheDocument();
    fireEvent.click(
      screen.getAllByRole("button", { name: "Account" })[0]
    );
    expect(screen.queryByRole("dialog", { name: "Account panel" })).not.toBeInTheDocument();
    expect(
      within(screen.getByLabelText("All profiles")).getByText("@phil")
    ).toBeInTheDocument();
    const featuredDeck = screen.getByRole("group", { name: "Featured profiles" });
    const profileList = screen.getByLabelText("All profiles");
    const profileRows = profileList.querySelector("ul");

    expect(featuredDeck).toHaveAttribute("aria-roledescription", "carousel");
    expect(profileRows).toHaveClass("grid-cols-1", "min-w-0");
    expect(
      within(featuredDeck).getByRole("button", {
        name: /Open @phil/
      })
    ).toBeInTheDocument();
    expect(
      within(
        within(profileList).getByRole("button", { name: /Open @phil/ })
      ).getByText("2 stories")
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Story bento grid")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Ketamine prison 5 scenes/ })).not.toBeInTheDocument();
    expect(screen.queryByText("Open story")).not.toBeInTheDocument();
    expect(
      within(featuredDeck).getByRole("button", { name: "Previous featured profile" })
    ).toBeInTheDocument();
    expect(
      within(featuredDeck).getByRole("button", { name: "Next featured profile" })
    ).toBeInTheDocument();
    expect(
      within(profileList).getAllByRole("button")
    ).toHaveLength(seedProfiles.length);
    expect(
      within(featuredDeck)
        .getByRole("button", { name: /Open @phil/ })
        .querySelector(".top-0.h-1")
    ).toBeNull();
    seedProfiles.forEach((profile) => {
      expect(
        screen.getByTestId(`profile-card-background-${profile.id}`)
      ).toBeInTheDocument();
    });
    expect(screen.queryByTestId("phone-shell")).not.toBeInTheDocument();

    openProfileFromList(/Open @phil/);

    expect(screen.getByRole("heading", { name: "@phil" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "@phil" }).parentElement
    ).toHaveClass("text-center");
    expect(screen.queryByRole("searchbox", { name: "Search profiles" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Back to home" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Story bento grid")).toHaveClass(
      "columns-1",
      "sm:columns-2",
      "overflow-y-auto",
      "w-full"
    );
    const storySelector = within(screen.getByLabelText("Story bento grid")).getByRole(
      "button",
      {
        name: /Ketamine prison 5 scenes/
      }
    );

    expect(storySelector).toHaveClass(
      "break-inside-avoid",
      "rounded-lg",
      "overflow-hidden"
    );
    expect(storySelector).not.toHaveClass("bg-slate-950");
    expect(
      screen
        .getByTestId("story-card-background-story-phil-1")
        .querySelector("img")
        ?.getAttribute("src")
    ).toContain("phil-ketamine-prison");
    expect(
      screen
        .getByTestId("story-card-background-story-phil-battle")
        .querySelector("img")
        ?.getAttribute("src")
    ).toContain("phil-battle-pixel");

    fireEvent.click(
      within(screen.getByRole("navigation", { name: "Desktop navigation" })).getByRole(
        "button",
        { name: "Home" }
      )
    );
    expect(screen.getByLabelText("All profiles")).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Search profiles" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Account settings" })).not.toBeInTheDocument();

    openFirstStory();
    await flushPlatformEffects();

    expect(screen.getByTestId("phone-shell")).toBeInTheDocument();
    expect(screen.getByLabelText("App shell")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Desktop navigation" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Mobile navigation" })).toBeInTheDocument();
    expect(appShell).toHaveClass("app-background--story");
    expect(appShell).not.toHaveClass("app-background--landing");
    expect(screen.getByRole("button", { name: "Back to profile" })).toBeInTheDocument();
    expect(screen.queryByRole("searchbox", { name: "Search profiles" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Open script editor" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Open storybook" })
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Back to stories")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Back to profile" }));

    expect(screen.getByRole("heading", { name: "@phil" })).toBeInTheDocument();
    expect(appShell).toHaveClass("app-background--landing");
    expect(appShell).not.toHaveClass("app-background--story");
  });

  it("opens the account panel from the same cluster as its trigger", async () => {
    mockSession = null;
    render(<App />);
    await flushPlatformEffects();

    const triggers = screen.getAllByRole("button", { name: "Account" });
    fireEvent.click(triggers[0]);

    const panel = screen.getByRole("dialog", { name: "Account panel" });

    expect(triggers[0].parentElement).toBe(panel.parentElement);
  });

  it("shows the signed-in handle in the account panel, never the legacy display name", async () => {
    mockSession = {
      ...ownerSession,
      user: { ...ownerSession.user, displayName: "phil's stories" }
    };
    render(<App />);
    await flushPlatformEffects();

    fireEvent.click(screen.getAllByRole("button", { name: "Account" })[0]);

    const panel = screen.getByRole("dialog", { name: "Account panel" });

    expect(within(panel).getByText("@phil")).toBeInTheDocument();
    expect(within(panel).queryByText("phil's stories")).not.toBeInTheDocument();
  });

  it("keeps a single Account trigger, with the mobile nav limited to Home, Explore, and Create", async () => {
    mockSession = null;
    render(<App />);
    await flushPlatformEffects();

    expect(
      within(screen.getByRole("navigation", { name: "Mobile navigation" }))
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-label"))
    ).toEqual(["Home", "Explore", "Create"]);
    expect(screen.getAllByRole("button", { name: "Account" })).toHaveLength(1);
  });

  it("registers with a handle, email, and password but no display name", async () => {
    mockSession = null;
    render(<App />);
    await flushPlatformEffects();

    fireEvent.click(screen.getAllByRole("button", { name: "Account" })[0]);

    const panel = screen.getByRole("dialog", { name: "Account panel" });
    fireEvent.click(within(panel).getByRole("button", { name: "Create" }));

    expect(screen.queryByLabelText("Display name")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
  });

  it("creates an unusable Better Auth identity and asks for verification", async () => {
    mockSession = null;
    render(<App />);
    await flushPlatformEffects();
    fireEvent.click(screen.getAllByRole("button", { name: "Account" })[0]);
    const panel = screen.getByRole("dialog", { name: "Account panel" });
    fireEvent.click(within(panel).getByRole("button", { name: "Create" }));
    fireEvent.change(within(panel).getByLabelText("Username"), {
      target: { value: "new_creator" }
    });
    fireEvent.change(within(panel).getByLabelText("Email"), {
      target: { value: "creator@example.com" }
    });
    fireEvent.change(within(panel).getByLabelText("Password"), {
      target: { value: "creator-password-2026" }
    });
    fireEvent.submit(within(panel).getByRole("button", { name: "Create account" }).closest("form")!);
    await flushQueuedStorySaves();

    expect(mockSession).toBeNull();
    expect(within(panel).getByText(/check your email to verify/i)).toBeInTheDocument();
    const request = vi.mocked(fetch).mock.calls.find(([input]) =>
      String(input).endsWith("/api/auth/sign-up/email")
    );
    expect(JSON.parse(String(request?.[1]?.body))).toMatchObject({
      email: "creator@example.com",
      username: "new_creator"
    });
  });

  it("signs in through Better Auth with one username-or-email field", async () => {
    mockSession = null;
    render(<App />);
    await flushPlatformEffects();
    fireEvent.click(screen.getAllByRole("button", { name: "Account" })[0]);
    const panel = screen.getByRole("dialog", { name: "Account panel" });

    fireEvent.change(within(panel).getByLabelText("Username or email"), {
      target: { value: "phil" }
    });
    fireEvent.change(within(panel).getByLabelText("Password"), {
      target: { value: "phil-password-2026" }
    });
    fireEvent.submit(
      within(panel).getAllByRole("button", { name: "Login" })[1].closest("form")!
    );
    await flushQueuedStorySaves();

    expect(mockSession).toEqual(ownerSession);
    expect(screen.queryByRole("dialog", { name: "Account panel" })).not.toBeInTheDocument();
  });

  it("renders account recovery at its route", async () => {
    mockSession = null;
    await renderAppAtPath("/account");

    expect(
      screen.getByRole("heading", { name: "Account & password" })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send reset link" })).toBeInTheDocument();
  });

  it("gates the account administration route with the Better Auth role", async () => {
    await renderAppAtPath("/admin/accounts");
    expect(screen.getByRole("heading", { name: "Admin access required" })).toBeInTheDocument();

    cleanup();
    setupApiMock(adminSession);
    await renderAppAtPath("/admin/accounts");
    expect(screen.getByRole("heading", { name: "Creator accounts" })).toBeInTheDocument();
  });

  it("keeps the neon background on the browsing route and off the story route", async () => {
    const { container } = render(<App />);
    await flushPlatformEffects();

    const appShell = screen.getByRole("main").parentElement;

    expect(appShell).toHaveClass("app-background--landing");
    expect(container.querySelector(".neon-bg")).not.toBeNull();

    openFirstStory();
    await flushPlatformEffects();

    expect(appShell).toHaveClass("app-background--story");
    expect(appShell).not.toHaveClass("app-background--landing");
    expect(container.querySelector(".neon-bg")).toBeNull();
  });

  it("renders a selected profile directly from the URL", async () => {
    mockSession = null;

    await renderAppAtPath("/profiles/user-demo-04");

    expect(window.location.pathname).toBe("/profiles/user-demo-04");
    expect(screen.getByLabelText("App shell")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "@demo-04" })).toBeInTheDocument();
    expect(
      within(screen.getByLabelText("Story bento grid")).getByRole("button", {
        name: /Read receipts 1 scene/
      })
    ).toBeInTheDocument();
  });

  it("renders a selected story directly from the URL", async () => {
    mockSession = null;

    await renderAppAtPath("/stories/story-demo-01-1");

    expect(window.location.pathname).toBe("/stories/story-demo-01-1");
    expect(screen.getByLabelText("App shell")).toBeInTheDocument();
    expect(screen.getByTestId("phone-shell")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back to profile" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Account panel" })).not.toBeInTheDocument();
  });

  it("renders Phil's battle story with the battle presentation instead of the phone", async () => {
    mockSession = null;

    await renderAppAtPath("/stories/story-phil-battle");

    act(() => {
      vi.advanceTimersByTime(1500);
    });

    expect(window.location.pathname).toBe("/stories/story-phil-battle");
    expect(screen.getByTestId("battle-stage")).toBeInTheDocument();
    expect(screen.queryByTestId("phone-shell")).not.toBeInTheDocument();
    expect(screen.getByTestId("battle-player-sprite")).toBeInTheDocument();
    expect(screen.getByTestId("battle-opponent-sprite")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Story controls" })).toBeInTheDocument();
  });

  it("pushes URLs while browsing from home to profile to story", async () => {
    mockSession = null;

    render(<App />);
    await flushPlatformEffects();

    openProfileFromList(/Open @demo-04/);

    expect(window.location.pathname).toBe("/profiles/user-demo-04");
    expect(screen.getByRole("heading", { name: "@demo-04" })).toBeInTheDocument();

    fireEvent.click(
      within(screen.getByLabelText("Story bento grid")).getByRole("button", {
        name: /Read receipts 1 scene/
      })
    );
    await flushPlatformEffects();

    expect(window.location.pathname).toBe("/stories/story-demo-04-1");
    expect(screen.getByTestId("phone-shell")).toBeInTheDocument();
  });

  it("moves through profile and home with the browser back button", async () => {
    mockSession = null;

    render(<App />);
    await flushPlatformEffects();

    openProfileFromList(/Open @demo-04/);
    fireEvent.click(
      within(screen.getByLabelText("Story bento grid")).getByRole("button", {
        name: /Read receipts 1 scene/
      })
    );
    await flushPlatformEffects();

    await popTo("/profiles/user-demo-04");

    expect(window.location.pathname).toBe("/profiles/user-demo-04");
    expect(screen.getByRole("heading", { name: "@demo-04" })).toBeInTheDocument();

    await popTo("/");

    expect(window.location.pathname).toBe("/");
    expect(screen.getByRole("heading", { name: "chatsim" })).toBeInTheDocument();
  });

  it("uses URL navigation for the built-in back buttons", async () => {
    render(<App />);
    await flushPlatformEffects();

    openFirstStory();
    await flushPlatformEffects();

    expect(window.location.pathname).toBe("/stories/story-phil-1");

    fireEvent.click(screen.getByRole("button", { name: "Back to profile" }));

    expect(window.location.pathname).toBe("/profiles/user-phil");
    expect(screen.getByRole("heading", { name: "@phil" })).toBeInTheDocument();

    fireEvent.click(
      within(screen.getByRole("navigation", { name: "Desktop navigation" })).getByRole(
        "button",
        { name: "Home" }
      )
    );

    expect(window.location.pathname).toBe("/");
    expect(screen.getByRole("heading", { name: "chatsim" })).toBeInTheDocument();
  });

  it("cycles the featured deck and keeps logged-out browsing open", async () => {
    mockSession = null;
    render(<App />);
    await flushPlatformEffects();

    const deck = screen.getByRole("group", { name: "Featured profiles" });
    const cards = within(deck).getAllByRole("button", { name: /^Open / });

    expect(cards).toHaveLength(seedProfiles.length);

    const expectedPresets = [
      "sitting",
      "waving",
      "leaning",
      "walking",
      "floating"
    ];

    seedProfiles.forEach((profile, index) => {
      const cardArt = screen.getByTestId(
        `profile-card-background-${profile.id}`
      );

      expect(
        cardArt.querySelector(
          `[data-avatar-preset="${expectedPresets[index]}"]`
        )
      ).not.toBeNull();
    });

    const directory = screen.getByLabelText("All profiles");
    const compactAvatars = directory.querySelectorAll(
      '[data-avatar-variant="compact"]'
    );

    expect(compactAvatars).toHaveLength(seedProfiles.length);

    // Every card moves with compositor-friendly transform and opacity only.
    for (const card of cards) {
      expect(card.style.filter).toBe("");
      expect(card.style.transition).toBe(
        "transform 500ms ease-out, opacity 500ms ease-out"
      );
    }

    fireEvent.click(
      within(deck).getByRole("button", { name: "Next featured profile" })
    );

    for (const card of cards) {
      expect(card.style.filter).toBe("");
    }

    // Clicking the centred card opens that profile.
    fireEvent.click(cards[1]);
    await flushPlatformEffects();

    expect(
      screen.getByRole("heading", { name: `@${seedProfiles[1].username}` })
    ).toBeInTheDocument();
    expect(screen.queryByText("Sign in to browse")).not.toBeInTheDocument();
  });

  it("shows handles and bios with no invented profile title", async () => {
    mockSession = null;
    render(<App />);
    await flushPlatformEffects();

    expect(screen.getAllByText("@phil").length).toBeGreaterThan(0);
    expect(
      screen.getAllByText("chaotic texts i never should have sent").length
    ).toBeGreaterThan(0);
    expect(screen.queryByText("phil's stories")).not.toBeInTheDocument();
  });

  it("puts search between the deck and the list, not in the top bar", async () => {
    mockSession = null;
    render(<App />);
    await flushPlatformEffects();

    const search = screen.getByLabelText("Search profiles");
    const deck = screen.getByLabelText("Featured profiles");
    const list = screen.getByLabelText("All profiles");

    expect(
      deck.compareDocumentPosition(search) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(
      search.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it("filters profile rows from search by handle or bio", async () => {
    mockSession = null;
    render(<App />);
    await flushPlatformEffects();

    const list = screen.getByLabelText("All profiles");

    expect(within(list).getAllByRole("button")).toHaveLength(seedProfiles.length);
    expect(within(list).getAllByRole("button")[0]).toHaveAccessibleName(
      "Open @phil, 2 stories"
    );

    fireEvent.change(screen.getByRole("searchbox", { name: "Search profiles" }), {
      target: { value: "phil" }
    });

    const philRows = within(list).getAllByRole("button");

    expect(philRows).toHaveLength(1);
    expect(philRows[0]).toHaveAccessibleName("Open @phil, 2 stories");
    expect(screen.queryByRole("button", { name: /Open @demo-04/ })).not.toBeInTheDocument();

    // Searching collapses the featured deck so only the list remains.
    expect(
      screen.queryByRole("group", { name: "Featured profiles" })
    ).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("searchbox", { name: "Search profiles" }), {
      target: { value: "@demo-04" }
    });

    const handleRows = within(list).getAllByRole("button");

    expect(handleRows).toHaveLength(1);
    expect(handleRows[0]).toHaveAccessibleName("Open @demo-04, 1 story");
    expect(screen.queryByRole("button", { name: /Open @phil/ })).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("searchbox", { name: "Search profiles" }), {
      target: { value: "chaotic" }
    });

    const bioRows = within(list).getAllByRole("button");

    expect(bioRows).toHaveLength(1);
    expect(bioRows[0]).toHaveAccessibleName("Open @phil, 2 stories");
  });

  it("hides the search field inside a selected profile and keeps its stories visible", async () => {
    mockStories["story-phil-cafe"] = createMockStory(
      "user-phil",
      "story-phil-cafe",
      "Cafe drift",
      41
    );
    mockStories["story-phil-soccer"] = createMockStory(
      "user-phil",
      "story-phil-soccer",
      "Soccer season",
      42
    );

    render(<App />);
    await flushPlatformEffects();
    openProfileFromList(/Open @phil/);

    const storyGrid = screen.getByLabelText("Story bento grid");

    expect(within(storyGrid).getAllByRole("button")).toHaveLength(4);
    expect(screen.queryByRole("searchbox", { name: "Search profiles" })).not.toBeInTheDocument();
    expect(
      within(storyGrid).getByRole("button", { name: /Open Battle 1 scene/ })
    ).toBeInTheDocument();
    expect(
      within(storyGrid).getByRole("button", { name: /Open Soccer season 1 scene/ })
    ).toBeInTheDocument();
    expect(within(storyGrid).getByRole("button", { name: /Open Ketamine prison 5 scenes/ })).toBeInTheDocument();
  });

  it("falls back to generated profile art when a story has no curated cover", async () => {
    mockSession = null;
    render(<App />);
    await flushPlatformEffects();

    openProfileFromList(/Open @demo-01/);

    const backdrop = screen.getByTestId(
      "story-card-background-story-demo-01-1"
    );

    expect(backdrop.querySelector("img")).toBeNull();
    expect(backdrop.querySelector("svg")).not.toBeNull();
    expect(backdrop.querySelectorAll("svg path").length).toBeGreaterThan(0);
  });

  it("varies the fallback art across a profile's uncovered stories instead of repeating one image", async () => {
    mockSession = null;
    mockStories["story-demo-01-2"] = createMockStory(
      "user-demo-01",
      "story-demo-01-2",
      "Second demo story",
      7
    );

    render(<App />);
    await flushPlatformEffects();

    openProfileFromList(/Open @demo-01/);

    const firstStrokes = Array.from(
      screen
        .getByTestId("story-card-background-story-demo-01-1")
        .querySelectorAll("path")
    ).map((path) => path.getAttribute("d"));
    const secondStrokes = Array.from(
      screen
        .getByTestId("story-card-background-story-demo-01-2")
        .querySelectorAll("path")
    ).map((path) => path.getAttribute("d"));

    expect(firstStrokes.length).toBeGreaterThan(0);
    expect(firstStrokes).not.toEqual(secondStrokes);
  });

  it("keeps the curated cover image for a story that has one", async () => {
    mockSession = null;
    render(<App />);
    await flushPlatformEffects();

    openProfileFromList(/Open @phil/);

    const backdrop = screen.getByTestId("story-card-background-story-phil-1");
    const img = backdrop.querySelector("img");

    expect(img).not.toBeNull();
    expect(img?.getAttribute("src")).toContain("phil-ketamine-prison");
    expect(backdrop.querySelector("svg")).toBeNull();
  });

  it("uses an uploaded card variant only inside the selected profile", async () => {
    mockSession = null;
    mockStories["story-demo-01-1"].coverImage = {
      id: "image-demo-cover",
      variants: {
        card: "https://media.example/demo-card.webp",
        full: "https://media.example/demo-full.webp",
        thumb: "https://media.example/demo-thumb.webp"
      }
    };

    render(<App />);
    await flushPlatformEffects();

    expect(
      screen
        .getByTestId("profile-card-background-user-demo-01")
        .querySelector('img[src*="demo-card"]')
    ).toBeNull();

    openProfileFromList(/Open @demo-01/);

    const backdrop = screen.getByTestId(
      "story-card-background-story-demo-01-1"
    );

    expect(backdrop.querySelector("img")).toHaveAttribute(
      "src",
      "https://media.example/demo-card.webp"
    );
    expect(backdrop.querySelector("svg")).toBeNull();
  });

  it("gives story cards a three-way height rotation instead of one fixed slot", async () => {
    mockStories["story-phil-cafe"] = createMockStory(
      "user-phil",
      "story-phil-cafe",
      "Cafe drift",
      41
    );
    mockStories["story-phil-soccer"] = createMockStory(
      "user-phil",
      "story-phil-soccer",
      "Soccer season",
      42
    );

    render(<App />);
    await flushPlatformEffects();
    openProfileFromList(/Open @phil/);

    const tiles = within(screen.getByLabelText("Story bento grid")).getAllByRole(
      "button"
    );

    expect(tiles).toHaveLength(4);

    // The height utility is always the last class in the tile's class list.
    const heightClasses = tiles.map(
      (tile) => tile.className.trim().split(/\s+/).pop()
    );

    expect(new Set(heightClasses).size).toBeGreaterThan(1);
    expect(heightClasses).toEqual(["h-80", "h-64", "h-72", "h-80"]);
  });

  it("renders profile avatars without filters or filament depth", async () => {
    mockSession = null;
    const { container } = render(<App />);
    await flushPlatformEffects();

    expect(container.querySelector("filter, feGaussianBlur")).toBeNull();
    expect(container.querySelectorAll("[data-avatar-preset]")).toHaveLength(10);
    expect(container.querySelector(".profile-art__depth")).toBeNull();
  });

  it("shows editor controls to admins on stories they do not own", async () => {
    setupApiMock(adminSession);
    render(<App />);
    await flushPlatformEffects();

    openProfileFromList(/Open @demo-01/);
    fireEvent.click(
      within(screen.getByLabelText("Story bento grid")).getByRole("button", {
        name: /Last seen typing 1 scene/
      })
    );
    await flushPlatformEffects();

    expect(screen.getByRole("button", { name: "Open storybook" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open script editor" }));

    expect(screen.getByRole("dialog", { name: "Script editor" })).toBeInTheDocument();
  });

  it("fades in a selected story before starting playback", async () => {
    await renderAppOnStory({ waitForIntro: false });

    const storyStage = screen.getByTestId("story-stage");

    expect(storyStage).toHaveClass(
      "pointer-events-none",
      "translate-y-3",
      "opacity-0"
    );
    expect(screen.queryByText("Phil is typing")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Play conversation" })).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1499);
    });

    expect(screen.queryByText("Phil is typing")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Play conversation" })).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(storyStage).toHaveClass("translate-y-0", "opacity-100");
    expect(screen.getByText("Phil is typing")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pause conversation" })).toBeInTheDocument();
  });

  it("renders external story controls after the script completes", async () => {
    await renderAppOnStory();

    expect(screen.getByRole("heading", { name: "Phil" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pause conversation" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Playback speed 1x" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "NXT" })).toBeInTheDocument();
    const storyControls = screen.getByRole("navigation", { name: "Story controls" });
    expect(storyControls).toHaveClass(
      "grid-cols-4",
      "w-[min(344px,calc(100vw-40px))]"
    );
    const storyControlButtons = storyControls.querySelectorAll("button");
    expect(storyControlButtons).toHaveLength(4);
    storyControlButtons.forEach((button) => {
      expect(button).toHaveClass("active:scale-95", "duration-150");
    });
    expect(screen.getByRole("button", { name: "Pause conversation" })).toHaveClass(
      "from-violet-400/85"
    );
    expect(screen.getByRole("button", { name: "Playback speed 1x" })).toHaveClass(
      "from-cyan-300/80"
    );
    expect(screen.queryByRole("button", { name: "Replay conversation" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "NXT" }));
    fireEvent.click(screen.getByRole("button", { name: "Open script editor" }));

    expect(screen.getByLabelText("Scene title")).toHaveValue("Scene 2");
    expect(screen.getByRole("button", { name: "Choose scene 2: Scene 2" })).toHaveClass(
      "bg-slate-950"
    );
  });

  it("keeps the story player controls inside the available shell height", async () => {
    await renderAppOnStory();

    expect(screen.getByTestId("story-stage")).toHaveClass(
      "h-[calc(100dvh-176px)]",
      "md:h-[calc(100dvh-104px)]",
      "min-h-[426px]"
    );
    expect(screen.getByTestId("phone-shell")).toHaveClass(
      "flex-1",
      "min-h-[360px]",
      "max-h-[740px]"
    );
    expect(screen.getByRole("navigation", { name: "Story controls" })).toHaveClass(
      "shrink-0"
    );
  });

  it("pauses, resumes, restarts, and toggles playback speed from story controls", async () => {
    await renderAppOnStory();

    fireEvent.click(screen.getByRole("button", { name: "Pause conversation" }));

    expect(screen.getByRole("button", { name: "Play conversation" })).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(30000);
    });

    expect(screen.queryByRole("button", { name: "Replay conversation" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Playback speed 1x" }));

    expect(screen.getByRole("button", { name: "Playback speed 2x" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Play conversation" }));

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.getByRole("button", { name: "Restart conversation" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Restart conversation" }));

    expect(screen.getByRole("button", { name: "Pause conversation" })).toBeInTheDocument();
  });

  it("expands the other speaker avatar from the chat header", async () => {
    await renderAppOnStory();

    fireEvent.click(screen.getByRole("button", { name: "Open Phil avatar" }));

    expect(
      screen.getByRole("dialog", { name: "Phil avatar preview" })
    ).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });

    expect(
      screen.queryByRole("dialog", { name: "Phil avatar preview" })
    ).not.toBeInTheDocument();
  });

  it("opens the script editor without a password in development", async () => {
    await renderEditorOnStory();

    expect(screen.queryByLabelText("Editor password")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Script editor" })).toHaveClass(
      "text-3xl"
    );
    expect(screen.queryByRole("heading", { name: "Conversation database" })).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Story scenes" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Collapse general settings" })).toBeInTheDocument();
    expect(screen.getByLabelText("Story name")).toHaveValue("Ketamine prison");
    expect(screen.getByText("Choose scene")).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: /Choose scene \d+:/ })
    ).toHaveLength(5);
    expect(
      screen.getByRole("button", { name: "Choose scene 1: Scene 1" })
    ).toHaveClass("h-11", "w-11", "rounded-full", "bg-slate-950");
    expect(screen.getByRole("button", { name: "Add scene" })).toHaveClass(
      "h-11",
      "w-11",
      "rounded-full"
    );
    expect(screen.queryByRole("button", { name: "Choose scene 10: Scene 10" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("POV name")).toBeInTheDocument();
    expect(screen.getByLabelText("Speaker name")).toBeInTheDocument();
    expect(screen.getByLabelText("Speaker status")).toBeInTheDocument();
    expect(screen.getByLabelText("Speaker status")).toHaveValue("online now");
    expect(screen.getByRole("note", { name: "Avatar upload status" })).toHaveTextContent(
      "temporarily unavailable"
    );
    expect(screen.queryByLabelText("Upload POV avatar")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Upload speaker avatar")).not.toBeInTheDocument();
    expect(screen.getByText("Timing defaults")).toBeInTheDocument();
    expect(screen.getByLabelText("Speaker is typing speed")).toBeInTheDocument();
    expect(screen.getByLabelText("Default pause after ms")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Preview" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Save changes" })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Close script editor" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Undo last edit" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Open scene picker" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("JSON database")).not.toBeInTheDocument();
  });

  it("updates the visible other speaker name from the editor", async () => {
    await renderEditorOnStory();

    fireEvent.change(screen.getByLabelText("Speaker name"), {
      target: { value: "Jules" }
    });

    expect(screen.getByRole("heading", { name: "Jules" })).toBeInTheDocument();
  });

  it("edits the story name from collapsible general settings", async () => {
    await renderEditorOnStory();

    fireEvent.change(screen.getByLabelText("Story name"), {
      target: { value: "Tiny chaos" }
    });

    expect(screen.getByLabelText("Story name")).toHaveValue("Tiny chaos");

    fireEvent.click(screen.getByRole("button", { name: "Collapse general settings" }));

    expect(screen.queryByLabelText("Story name")).not.toBeInTheDocument();
    expect(screen.queryByText("Choose scene")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Expand general settings" }));

    expect(screen.getByLabelText("Story name")).toHaveValue("Tiny chaos");

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    fireEvent.click(screen.getByRole("button", { name: "Open storybook" }));

    expect(screen.getByRole("button", { name: "Select Tiny chaos" })).toBeInTheDocument();
  });

  it("keeps an empty story name editable and blocks saving", async () => {
    await renderEditorOnStory();

    fireEvent.change(screen.getByLabelText("Story name"), {
      target: { value: "" }
    });

    expect(screen.getByLabelText("Story name")).toHaveValue("");
    expect(screen.getByLabelText("Story name")).toHaveAttribute(
      "placeholder",
      "add a name please"
    );

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(screen.getByRole("dialog", { name: "Script editor" })).toBeInTheDocument();
    expect(screen.getByText("Fill Story name before saving.")).toBeInTheDocument();
    expect(screen.getByLabelText("Story name")).toHaveClass("bg-rose-50/70");
    expect(screen.getByLabelText("Story name")).toHaveValue("");
  });

  it("keeps spaces while editing story, scene, and profile names", async () => {
    await renderEditorOnStory();

    fireEvent.change(screen.getByLabelText("Story name"), {
      target: { value: "Story " }
    });
    fireEvent.change(screen.getByLabelText("Scene title"), {
      target: { value: "Scene " }
    });
    fireEvent.change(screen.getByLabelText("POV name"), {
      target: { value: "Maya " }
    });
    fireEvent.change(screen.getByLabelText("Speaker name"), {
      target: { value: "Frank " }
    });

    expect(screen.getByLabelText("Story name")).toHaveValue("Story ");
    expect(screen.getByLabelText("Scene title")).toHaveValue("Scene ");
    expect(screen.getByLabelText("POV name")).toHaveValue("Maya ");
    expect(screen.getByLabelText("Speaker name")).toHaveValue("Frank ");
  });

  it("uses status-colored avatar rings and truncates long phone names", async () => {
    await renderEditorOnStory();

    const longName = "This is a very very long speaker name";

    fireEvent.change(screen.getByLabelText("Speaker name"), {
      target: { value: longName }
    });
    fireEvent.change(screen.getByLabelText("Speaker status"), {
      target: { value: "busy" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(screen.queryByText("busy")).not.toBeInTheDocument();
    expect(screen.queryByText("online now")).not.toBeInTheDocument();
    expect(screen.getByRole("banner")).toHaveClass(
      "grid-cols-[32px_minmax(0,1fr)_104px]"
    );
    expect(screen.getByRole("heading", { name: longName })).toHaveClass(
      "truncate"
    );
    screen.getAllByLabelText(`${longName} avatar`).forEach((avatar) => {
      expect(avatar).toHaveClass("ring-rose-400/80");
    });
  });

  it("shows save warnings for missing required scene settings", async () => {
    await renderEditorOnStory();
    fireEvent.change(screen.getByLabelText("POV name"), {
      target: { value: "" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(screen.getByRole("dialog", { name: "Script editor" })).toBeInTheDocument();
    expect(screen.getByText("Fill POV name before saving.")).toBeInTheDocument();
    expect(screen.getByLabelText("POV name")).toHaveClass("bg-rose-50/70");
  });

  it("auto-updates initials from speaker names when they still match the name", async () => {
    await renderEditorOnStory();
    fireEvent.change(screen.getByLabelText("Speaker name"), {
      target: { value: "Zelda" }
    });

    expect(screen.getByLabelText("Speaker initials")).toHaveValue("Z");
  });

  it("places compact speaker and media controls beside the editable line", async () => {
    await renderEditorOnStory();

    const speakerRow = screen.getByTestId("line-1-speaker-row");
    const textRow = screen.getByTestId("line-1-text-row");
    const textTools = screen.getByTestId("line-1-text-tools");
    const messageText = screen.getByLabelText("Message 1 text");

    expect(speakerRow).toHaveClass("inline-flex", "w-fit", "gap-3");
    expect(screen.getByLabelText("Message 1 speaker")).toHaveClass("!mt-0", "!w-40");
    expect(screen.getByRole("button", { name: "Open emoji picker for line 1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Attach image to line 1 (coming soon)" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add voice clip to line 1 (coming soon)" })).toBeDisabled();
    expect(textTools).toHaveClass("flex", "flex-col", "items-center", "self-start");
    expect(textTools).not.toHaveClass("flex-nowrap", "justify-end");
    expect(textTools).not.toHaveClass("grid-rows-3", "rounded-full", "border");
    expect(messageText).not.toHaveClass("pr-24");
    expect(textRow).toHaveClass("grid-cols-[minmax(0,1fr)_auto]");
    expect(textRow.firstElementChild).toContainElement(messageText);
    expect(textRow.lastElementChild).toBe(textTools);

    fireEvent.click(screen.getByRole("button", { name: "Open emoji picker for line 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Insert 🙄 roll_eyes emoji" }));

    expect(screen.getByLabelText("Message 1 text")).toHaveValue(
      "Yo I need your breast milk asap🙄"
    );
  });

  it("replaces colon emoji autocomplete in message text", async () => {
    await renderEditorOnStory();

    fireEvent.change(screen.getByLabelText("Message 1 text"), {
      target: { selectionEnd: 8, selectionStart: 8, value: "ok :roll" }
    });

    fireEvent.click(screen.getByRole("button", { name: "Use 🙄 roll_eyes emoji autocomplete" }));

    expect(screen.getByLabelText("Message 1 text")).toHaveValue("ok 🙄");
  });

  it("collapses the scene settings panel from its header", async () => {
    await renderEditorOnStory();

    expect(screen.getByLabelText("Scene title")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Collapse scene settings" }));

    expect(screen.queryByLabelText("Scene title")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Expand scene settings" }));

    expect(screen.getByLabelText("Scene title")).toBeInTheDocument();
  });

  it("keeps an empty editable line blank and shows a soft write prompt", async () => {
    await renderEditorOnStory();

    fireEvent.change(screen.getByLabelText("Message 1 text"), {
      target: { value: "" }
    });

    const emptyLine = screen.getByLabelText("Message 1 text");

    expect(emptyLine).toHaveValue("");
    expect(emptyLine).toHaveAttribute("placeholder", "write something");
    expect(emptyLine).toHaveClass("bg-rose-50/70");
  });

  it("allows spaces at the end of an edited message", async () => {
    await renderEditorOnStory();

    fireEvent.change(screen.getByLabelText("Message 1 text"), {
      target: { value: "hey " }
    });

    expect(screen.getByLabelText("Message 1 text")).toHaveValue("hey ");
  });

  it("places the default timing toggle under the typing speed field", async () => {
    await renderEditorOnStory();

    const typingInput = screen.getByLabelText("Message 1 typing speed");
    const useDefault = screen.getByLabelText("Line 1 use default typing time");

    expect(typingInput).toBeDisabled();
    expect(useDefault).toBeChecked();

    fireEvent.click(useDefault);

    expect(typingInput).toBeEnabled();
  });

  it("folds a script line from the line header", async () => {
    await renderEditorOnStory();

    expect(screen.getByRole("button", { name: "Collapse line 1" })).toHaveTextContent(
      "P: Yo I need your breast milk asap"
    );
    expect(screen.getByLabelText("Message 1 text")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: /^Collapse line 1$/ })
    );

    expect(screen.getByRole("button", { name: "Expand line 1" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Message 1 text")).not.toBeInTheDocument();
  });

  it("defaults POV typing and pause controls to checked per line", async () => {
    await renderEditorOnStory();

    const typingInput = screen.getByLabelText("Message 2 typing speed");
    const useDefaultTyping = screen.getByLabelText("Line 2 use default typing time");
    const pauseInput = screen.getByLabelText("Message 2 pause milliseconds");
    const useDefaultPause = screen.getByLabelText("Line 2 use default pause time");

    expect(typingInput).toBeDisabled();
    expect(useDefaultTyping).toBeChecked();
    expect(pauseInput).toBeDisabled();
    expect(useDefaultPause).toBeChecked();

    fireEvent.click(useDefaultTyping);
    fireEvent.click(useDefaultPause);

    expect(typingInput).toBeEnabled();
    expect(pauseInput).toBeEnabled();
  });

  it("keeps edits scoped to the selected scene", async () => {
    await renderEditorOnStory();

    fireEvent.change(screen.getByLabelText("Message 1 text"), {
      target: { value: "scene one edit" }
    });

    fireEvent.click(screen.getByRole("button", { name: "Choose scene 2: Scene 2" }));

    expect(screen.getByLabelText("Scene title")).toHaveValue("Scene 2");
    expect(screen.getByLabelText("Message 1 text")).toHaveValue("");

    fireEvent.change(screen.getByLabelText("Message 1 text"), {
      target: { value: "scene two edit" }
    });

    fireEvent.click(screen.getByRole("button", { name: "Choose scene 1: Scene 1" }));

    expect(screen.getByLabelText("Scene title")).toHaveValue("Scene 1");
    expect(screen.getByLabelText("Message 1 text")).toHaveValue("scene one edit");
  });

  it("renames storyboards and scenes independently", async () => {
    await renderAppOnStory();

    fireEvent.click(screen.getByRole("button", { name: "Open storybook" }));
    fireEvent.change(screen.getByLabelText("Storyboard title"), {
      target: { value: "Unhinged conversation" }
    });

    expect(
      screen.getByRole("button", { name: "Select Unhinged conversation" })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open storybook" }));
    fireEvent.click(screen.getByRole("button", { name: "Open script editor" }));
    fireEvent.change(screen.getByLabelText("Scene title"), {
      target: { value: "Strange message" }
    });

    expect(
      screen.getByRole("button", { name: "Choose scene 1: Strange message" })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    fireEvent.click(screen.getByRole("button", { name: "Open storybook" }));

    expect(
      screen.getByRole("button", { name: "Select Unhinged conversation" })
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Select Strange message" })).not.toBeInTheDocument();
  });

  it("warns near the scene line limit and blocks line creation at one hundred", async () => {
    await renderAppOnStory();

    fireEvent.click(screen.getByRole("button", { name: "Open storybook" }));
    fireEvent.click(screen.getByRole("button", { name: "New story" }));
    await flushPlatformEffects();
    fireEvent.click(screen.getByRole("button", { name: "Open script editor" }));

    for (let index = 0; index < 59; index += 1) {
      fireEvent.click(screen.getByRole("button", { name: "Add line" }));
    }

    expect(screen.getByText("60 / 100 lines")).toBeInTheDocument();
    expect(screen.queryByText("Scene length")).not.toBeInTheDocument();
    expect(
      screen.getByText("40 lines left before Scene 2.")
    ).toBeInTheDocument();

    for (let index = 0; index < 40; index += 1) {
      fireEvent.click(screen.getByRole("button", { name: "Add line" }));
    }

    expect(screen.getByText("100 / 100 lines")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add line" })).toBeDisabled();
    expect(
      screen.getByText("Scene limit reached. Start Scene 2 to continue.")
    ).toBeInTheDocument();
  }, 120000);

  it("undo restores up to five previous editor versions", async () => {
    await renderAppOnStory();

    fireEvent.click(screen.getByRole("button", { name: "Open script editor" }));

    for (let index = 1; index <= 6; index += 1) {
      fireEvent.change(screen.getByLabelText("POV name"), {
        target: { value: `Name ${index}` }
      });
    }

    const undoButton = screen.getByRole("button", { name: "Undo last edit" });

    expect(undoButton).toBeEnabled();

    for (let index = 0; index < 5; index += 1) {
      fireEvent.click(screen.getByRole("button", { name: "Undo last edit" }));
    }

    expect(screen.getByLabelText("POV name")).toHaveValue("Name 1");
    expect(screen.getByRole("button", { name: "Undo last edit" })).toBeDisabled();
  });

  it("opens the storybook selector and creates a blank new story", async () => {
    await renderAppOnStory();

    fireEvent.click(screen.getByRole("button", { name: "Open storybook" }));

    expect(screen.getByRole("dialog", { name: "Storybook" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Select Ketamine prison" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit Ketamine prison" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete Ketamine prison" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "New story" }));
    await flushPlatformEffects();

    expect(screen.getByRole("heading", { name: "Frank" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open storybook" }));
    expect(screen.getByRole("button", { name: "Select Story 3" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open storybook" }));
    fireEvent.click(screen.getByRole("button", { name: "Open script editor" }));

    expect(screen.getAllByRole("button", { name: /Choose scene \d+:/ })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Add scene" })).toBeInTheDocument();
    expect(screen.getByLabelText("Scene title")).toHaveValue("Scene 1");
    expect(screen.getByLabelText("Message 1 text")).toHaveValue("");

    fireEvent.click(screen.getByRole("button", { name: "Add scene" }));

    expect(screen.getAllByRole("button", { name: /Choose scene \d+:/ })).toHaveLength(2);
    expect(screen.getByLabelText("Scene title")).toHaveValue("Scene 2");
  });

  it("adds created scenes from the editor up to ten", async () => {
    await renderEditorOnStory();

    expect(screen.getAllByRole("button", { name: /Choose scene \d+:/ })).toHaveLength(5);

    for (let index = 0; index < 5; index += 1) {
      fireEvent.click(screen.getByRole("button", { name: "Add scene" }));
    }

    expect(screen.getAllByRole("button", { name: /Choose scene \d+:/ })).toHaveLength(10);
    expect(screen.getByRole("button", { name: "Choose scene 10: Scene 10" })).toHaveClass(
      "bg-slate-950"
    );
    expect(screen.queryByRole("button", { name: "Add scene" })).not.toBeInTheDocument();
  });

  it("edits and deletes stories from storybook rows", async () => {
    await renderAppOnStory();

    fireEvent.click(screen.getByRole("button", { name: "Open storybook" }));
    fireEvent.click(screen.getByRole("button", { name: "New story" }));
    await flushPlatformEffects();
    fireEvent.click(screen.getByRole("button", { name: "Open script editor" }));
    fireEvent.click(screen.getByRole("button", { name: "Add scene" }));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    fireEvent.click(screen.getByRole("button", { name: "Open storybook" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit Story 3" }));

    expect(screen.getByRole("dialog", { name: "Script editor" })).toBeInTheDocument();
    expect(screen.getByLabelText("Scene title")).toHaveValue("Scene 2");

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    fireEvent.click(screen.getByRole("button", { name: "Open storybook" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete Story 3" }));

    expect(screen.getByRole("button", { name: "Select Story 3" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm delete Story 3" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel delete Story 3" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cancel delete Story 3" }));

    expect(screen.getByRole("button", { name: "Select Story 3" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Delete Story 3" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm delete Story 3" }));
    await flushPlatformEffects();

    expect(screen.queryByRole("button", { name: "Select Story 3" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open storybook" }));
    expect(screen.getByRole("button", { name: "Select Ketamine prison" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Delete Ketamine prison" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm delete Ketamine prison" }));
    await flushPlatformEffects();

    expect(window.location.pathname).toBe("/stories/story-phil-battle");
    expect(screen.getByTestId("battle-stage")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Select Ketamine prison" })).not.toBeInTheDocument();
  });

  it("keeps the editor open and reports remote save failures", async () => {
    await renderEditorOnStory();

    failNextStoryUpdate = true;

    fireEvent.change(screen.getByLabelText("Story name"), {
      target: { value: "Story with a busted save" }
    });
    await flushPlatformEffects();

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await flushPlatformEffects();

    expect(screen.getByRole("dialog", { name: "Script editor" })).toBeInTheDocument();
    expect(screen.getByText("Could not save story.")).toBeInTheDocument();
  });

  it("serializes editor autosaves so older writes cannot finish last", async () => {
    await renderEditorOnStory();
    holdStoryUpdates = true;

    fireEvent.change(screen.getByLabelText("Story name"), {
      target: { value: "First queued title" }
    });
    await flushPlatformEffects();

    fireEvent.change(screen.getByLabelText("Story name"), {
      target: { value: "Newest queued title" }
    });
    await flushPlatformEffects();

    expect(activeStoryUpdates).toBe(1);
    expect(pendingStoryUpdateReleases).toHaveLength(1);
    expect(maxConcurrentStoryUpdates).toBe(1);

    await act(async () => {
      pendingStoryUpdateReleases.shift()?.();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(activeStoryUpdates).toBe(1);
    expect(pendingStoryUpdateReleases).toHaveLength(1);

    holdStoryUpdates = false;
    await act(async () => {
      pendingStoryUpdateReleases.shift()?.();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(maxConcurrentStoryUpdates).toBe(1);
    expect(mockStories["story-phil-1"].title).toBe("Newest queued title");
  });

  it("keeps storybook rows visible and reports failed deletes", async () => {
    await renderAppOnStory();

    fireEvent.click(screen.getByRole("button", { name: "Open storybook" }));
    failNextStoryDelete = true;
    fireEvent.click(screen.getByRole("button", { name: "Delete Ketamine prison" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm delete Ketamine prison" }));
    await flushPlatformEffects();

    expect(screen.getByRole("button", { name: "Select Ketamine prison" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm delete Ketamine prison" })).toBeInTheDocument();
    expect(screen.getByText("Could not delete story.")).toBeInTheDocument();
  });

  it("uses a clean phone shell and opens the editor as a full-screen dialog", async () => {
    await renderAppOnStory();

    expect(screen.getByTestId("phone-shell")).toBeInTheDocument();
    expect(screen.queryByTestId("phone-sensor")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open script editor" }));

    expect(
      screen.getByRole("dialog", { name: "Script editor" })
    ).toHaveClass("inset-0", "bg-gradient-to-br", "overflow-x-hidden");
  });

  it("uses a clean POV composer without phone attachment controls", async () => {
    await renderAppOnStory();

    expect(screen.getByText("Type a message")).toBeInTheDocument();
    expect(screen.getByLabelText("Nor avatar")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open phone emoji tray" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Attach image" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Record voice clip" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add attachment" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Send" })).not.toBeInTheDocument();
  });
});
