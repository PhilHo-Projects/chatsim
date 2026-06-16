import { act, fireEvent, render, screen, within } from "@testing-library/react";
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
  token: "test-session",
  user: {
    displayName: "phil's stories",
    id: "user-phil",
    role: "member",
    username: "phil"
  }
};

const adminSession: PlatformSession = {
  token: "admin-session",
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
let storyCounter: number;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function toStoryCard(story: PlatformStoryRecord) {
  return {
    coverColor: story.coverColor,
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

      if (method === "GET" && url.pathname === "/api/auth/session") {
        return jsonResponse({ session: mockSession });
      }

      if (method === "POST" && url.pathname === "/api/auth/login") {
        mockSession = ownerSession;
        return jsonResponse({ session: mockSession });
      }

      if (method === "POST" && url.pathname === "/api/auth/register") {
        mockSession = {
          token: "registered-session",
          user: {
            displayName: body.displayName || `${body.username}'s stories`,
            id: `user-${body.username}`,
            role: "member",
            username: body.username
          }
        };
        mockProfiles = [
          ...mockProfiles,
          {
            accentColor: "#f472b6",
            displayName: mockSession.user.displayName,
            id: mockSession.user.id,
            stories: [],
            username: mockSession.user.username
          }
        ];
        return jsonResponse({ session: mockSession }, 201);
      }

      if (method === "POST" && url.pathname === "/api/auth/logout") {
        mockSession = null;
        return jsonResponse({ ok: true });
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

function openFirstStory() {
  if (!screen.queryByLabelText("Story bento grid")) {
    fireEvent.click(
      screen.getByRole("button", {
        name: /Open phil's stories/
      })
    );
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
    localStorage.clear();
    setBrowserPath("/");
    setupApiMock();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("starts in a persistent Pinterest-style browsing shell", async () => {
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
    ).toEqual(["Account", "Home", "Explore", "Create story", "Toggle theme"]);
    expect(screen.getByRole("navigation", { name: "Mobile navigation" })).toHaveClass(
      "md:hidden"
    );
    expect(screen.getByRole("searchbox", { name: "Search stories" })).toBeInTheDocument();
    const appShell = screen.getByRole("main").parentElement;

    expect(appShell).toHaveClass("app-background", "app-background--landing");
    expect(appShell).not.toHaveClass("app-background--story");
    expect(screen.queryByText("choose a story")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Account settings" })).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "chatsim" }).parentElement
    ).toHaveClass("text-center");
    fireEvent.click(
      within(screen.getByRole("navigation", { name: "Desktop navigation" })).getByRole(
        "button",
        { name: "Account" }
      )
    );
    expect(screen.getByRole("dialog", { name: "Account panel" })).toBeInTheDocument();
    fireEvent.click(
      within(screen.getByRole("navigation", { name: "Desktop navigation" })).getByRole(
        "button",
        { name: "Account" }
      )
    );
    expect(screen.queryByRole("dialog", { name: "Account panel" })).not.toBeInTheDocument();
    expect(screen.getByText("phil's stories")).toBeInTheDocument();
    expect(screen.getByLabelText("Profile masonry")).toHaveClass(
      "overflow-y-auto"
    );
    expect(
      screen.getByRole("button", {
        name: /Open phil's stories/
      })
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("button", { name: /Open phil's stories/ })).getByText(
        "2 stories"
      )
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Story bento grid")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Ketamine prison 5 scenes/ })).not.toBeInTheDocument();
    expect(screen.queryByText("Open story")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Profile masonry")).toHaveClass(
      "columns-2",
      "lg:columns-5"
    );
    expect(screen.getByRole("button", { name: /Open phil's stories/ })).toHaveClass(
      "rounded-lg",
      "break-inside-avoid"
    );
    expect(screen.getByRole("button", { name: /Open phil's stories/ })).not.toHaveClass(
      "bg-slate-950"
    );
    expect(
      screen.getByRole("button", { name: /Open phil's stories/ }).getAttribute("style")
    ).toMatch(/#e11d48|225,\s*29,\s*72/);
    expect(
      screen.getByRole("button", { name: /Open phil's stories/ }).querySelector(".top-0.h-1")
    ).toBeNull();
    seedProfiles.forEach((profile) => {
      expect(
        screen.getByTestId(`profile-card-background-${profile.id}`)
      ).toBeInTheDocument();
    });
    expect(screen.queryByTestId("phone-shell")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Open phil's stories/ }));

    expect(screen.getByRole("heading", { name: "phil's stories" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "phil's stories" }).parentElement
    ).toHaveClass("text-center");
    expect(screen.queryByRole("searchbox", { name: "Search stories" })).not.toBeInTheDocument();
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
    expect(storySelector.getAttribute("style")).toMatch(/#e11d48|225,\s*29,\s*72/);
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
    expect(screen.getByLabelText("Profile masonry")).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Search stories" })).toBeInTheDocument();
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
    expect(screen.queryByRole("searchbox", { name: "Search stories" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Open script editor" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Open storybook" })
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Back to stories")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Back to profile" }));

    expect(screen.getByRole("heading", { name: "phil's stories" })).toBeInTheDocument();
    expect(appShell).toHaveClass("app-background--landing");
    expect(appShell).not.toHaveClass("app-background--story");
  });

  it("renders a selected profile directly from the URL", async () => {
    mockSession = null;

    await renderAppAtPath("/profiles/user-dummy-20");

    expect(window.location.pathname).toBe("/profiles/user-dummy-20");
    expect(screen.getByLabelText("App shell")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "demo account 20" })).toBeInTheDocument();
    expect(
      within(screen.getByLabelText("Story bento grid")).getByRole("button", {
        name: /Placeholder Story 20 1 scene/
      })
    ).toBeInTheDocument();
  });

  it("renders a selected story directly from the URL", async () => {
    mockSession = null;

    await renderAppAtPath("/stories/story-neon-1");

    expect(window.location.pathname).toBe("/stories/story-neon-1");
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

    fireEvent.click(screen.getByRole("button", { name: /Open demo account 20/ }));

    expect(window.location.pathname).toBe("/profiles/user-dummy-20");
    expect(screen.getByRole("heading", { name: "demo account 20" })).toBeInTheDocument();

    fireEvent.click(
      within(screen.getByLabelText("Story bento grid")).getByRole("button", {
        name: /Placeholder Story 20 1 scene/
      })
    );
    await flushPlatformEffects();

    expect(window.location.pathname).toBe("/stories/story-dummy-20");
    expect(screen.getByTestId("phone-shell")).toBeInTheDocument();
  });

  it("moves through profile and home with the browser back button", async () => {
    mockSession = null;

    render(<App />);
    await flushPlatformEffects();

    fireEvent.click(screen.getByRole("button", { name: /Open demo account 20/ }));
    fireEvent.click(
      within(screen.getByLabelText("Story bento grid")).getByRole("button", {
        name: /Placeholder Story 20 1 scene/
      })
    );
    await flushPlatformEffects();

    await popTo("/profiles/user-dummy-20");

    expect(window.location.pathname).toBe("/profiles/user-dummy-20");
    expect(screen.getByRole("heading", { name: "demo account 20" })).toBeInTheDocument();

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
    expect(screen.getByRole("heading", { name: "phil's stories" })).toBeInTheDocument();

    fireEvent.click(
      within(screen.getByRole("navigation", { name: "Desktop navigation" })).getByRole(
        "button",
        { name: "Home" }
      )
    );

    expect(window.location.pathname).toBe("/");
    expect(screen.getByRole("heading", { name: "chatsim" })).toBeInTheDocument();
  });

  it("renders dummy account placeholder cards and keeps logged-out browsing open", async () => {
    mockSession = null;
    render(<App />);
    await flushPlatformEffects();

    const dummyOne = screen.getByRole("button", {
      name: /Open demo account 01/
    });
    const dummyTwenty = screen.getByRole("button", {
      name: /Open demo account 20/
    });

    expect(within(dummyOne).getByText("@dummy01")).toBeInTheDocument();
    expect(within(dummyTwenty).getByText("@dummy20")).toBeInTheDocument();
    expect(dummyOne).toHaveClass("h-72", "sm:h-80");
    expect(dummyTwenty).toHaveClass("h-60", "sm:h-80");
    const dummyOneImage = screen
      .getByTestId("profile-card-background-user-dummy-01")
      .querySelector("img")
      ?.getAttribute("src");
    const dummyTwentyImage = screen
      .getByTestId("profile-card-background-user-dummy-20")
      .querySelector("img")
      ?.getAttribute("src");

    expect(dummyOneImage).toBeTruthy();
    expect(dummyTwentyImage).toBeTruthy();
    expect(dummyOneImage).not.toBe(dummyTwentyImage);
    [
      ["04", "demo-04-vegetation"],
      ["05", "demo-05-brutalist-decor"],
      ["06", "demo-06-space-stuff"],
      ["09", "demo-09-hand-drawn-art"],
      ["10", "demo-10-stencil-art"],
      ["13", "demo-13-cosplay"],
      ["14", "demo-14-computer-geek"],
      ["15", "demo-15-pastel-crafts"],
      ["18", "demo-18-goofy-cartoon"],
      ["19", "demo-19-concrete-jungle"],
      ["20", "demo-20-crafty-space"]
    ].forEach(([accountNumber, themedCoverName]) => {
      const themedImage = screen
        .getByTestId(`profile-card-background-user-dummy-${accountNumber}`)
        .querySelector("img")
        ?.getAttribute("src");

      expect(themedImage).toContain(themedCoverName);
    });

    fireEvent.click(dummyTwenty);

    expect(screen.getByRole("heading", { name: "demo account 20" })).toBeInTheDocument();
    expect(
      within(screen.getByLabelText("Story bento grid")).getByRole("button", {
        name: /Placeholder Story 20 1 scene/
      })
    ).toBeInTheDocument();

    fireEvent.click(
      within(screen.getByLabelText("Story bento grid")).getByRole("button", {
        name: /Placeholder Story 20 1 scene/
      })
    );
    await flushPlatformEffects();

    expect(screen.getByLabelText("App shell")).toBeInTheDocument();
    expect(screen.getByTestId("phone-shell")).toBeInTheDocument();
    expect(screen.queryByText("Sign in to browse")).not.toBeInTheDocument();
  });

  it("filters profile cards from search by visible title or handle", async () => {
    mockSession = null;
    render(<App />);
    await flushPlatformEffects();

    const masonry = screen.getByLabelText("Profile masonry");
    const originalCards = within(masonry).getAllByRole("button");

    expect(originalCards).toHaveLength(seedProfiles.length);
    expect(originalCards[0]).toHaveAccessibleName("Open phil's stories, 2 stories");

    fireEvent.change(screen.getByRole("searchbox", { name: "Search stories" }), {
      target: { value: "phil's" }
    });

    const philCards = within(masonry).getAllByRole("button");

    expect(philCards).toHaveLength(1);
    expect(philCards[0]).toHaveAccessibleName("Open phil's stories, 2 stories");
    expect(screen.queryByRole("button", { name: /Open demo account 20/ })).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("searchbox", { name: "Search stories" }), {
      target: { value: "@dummy20" }
    });

    const handleCards = within(masonry).getAllByRole("button");

    expect(handleCards).toHaveLength(1);
    expect(handleCards[0]).toHaveAccessibleName("Open demo account 20, 1 story");
    expect(screen.queryByRole("button", { name: /Open phil's stories/ })).not.toBeInTheDocument();
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
    fireEvent.click(screen.getByRole("button", { name: /Open phil's stories/ }));

    const storyGrid = screen.getByLabelText("Story bento grid");

    expect(within(storyGrid).getAllByRole("button")).toHaveLength(4);
    expect(screen.queryByRole("searchbox", { name: "Search stories" })).not.toBeInTheDocument();
    expect(
      within(storyGrid).getByRole("button", { name: /Open Battle 1 scene/ })
    ).toBeInTheDocument();
    expect(
      within(storyGrid).getByRole("button", { name: /Open Soccer season 1 scene/ })
    ).toBeInTheDocument();
    expect(within(storyGrid).getByRole("button", { name: /Open Ketamine prison 5 scenes/ })).toBeInTheDocument();
  });

  it("shows editor controls to admins on stories they do not own", async () => {
    setupApiMock(adminSession);
    render(<App />);
    await flushPlatformEffects();

    fireEvent.click(screen.getByRole("button", { name: /Open neon sleepover/ }));
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
    expect(screen.getByRole("button", { name: "Next scene" })).toBeInTheDocument();
    expect(screen.getByLabelText("Scene 1 of 5")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous scene" })).toBeDisabled();
    const storyControls = screen.getByRole("navigation", { name: "Story controls" });
    expect(storyControls).toHaveClass(
      "grid-cols-4",
      "w-[min(344px,calc(100vw-40px))]"
    );
    const storyControlButtons = storyControls.querySelectorAll("button");
    expect(storyControlButtons).toHaveLength(5);
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

    fireEvent.click(screen.getByRole("button", { name: "Next scene" }));
    fireEvent.click(screen.getByRole("button", { name: "Open script editor" }));

    expect(screen.getByLabelText("Scene title")).toHaveValue("Scene 2");
    expect(screen.getByRole("button", { name: "Choose scene 2: Scene 2" })).toHaveClass(
      "bg-[var(--editor-action)]"
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
    ).toHaveClass("h-11", "w-11", "rounded-full", "bg-[var(--editor-action)]");
    expect(screen.getByRole("button", { name: "Add scene" })).toHaveClass(
      "h-11",
      "w-11",
      "rounded-full"
    );
    expect(screen.queryByRole("button", { name: "Choose scene 10: Scene 10" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("POV name")).toBeInTheDocument();
    expect(screen.getByLabelText("POV avatar image")).toBeInTheDocument();
    expect(screen.getByLabelText("Speaker name")).toBeInTheDocument();
    expect(screen.getByLabelText("Speaker avatar image")).toBeInTheDocument();
    expect(screen.getByLabelText("Speaker status")).toBeInTheDocument();
    expect(screen.getByLabelText("Speaker status")).toHaveValue("online now");
    expect(screen.getByLabelText("Upload speaker avatar")).toBeInTheDocument();
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
    expect(screen.getByLabelText("Story name")).toHaveClass(
      "bg-[var(--editor-field-missing)]"
    );
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
      "grid-cols-[minmax(0,1fr)_104px]"
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
    expect(screen.getByLabelText("POV name")).toHaveClass(
      "bg-[var(--editor-field-missing)]"
    );
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
    expect(emptyLine).toHaveClass("bg-[var(--editor-field-missing)]");
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
  }, 60000);

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
      "bg-[var(--editor-action)]"
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
