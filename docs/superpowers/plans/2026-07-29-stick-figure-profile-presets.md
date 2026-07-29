# Stick-Figure Profile Presets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace public profile filament art with five stable, restrained stick-figure SVG presets while keeping uploaded and curated imagery inside profile story grids.

**Architecture:** A focused `src/profile-avatars/` module owns the typed five-preset catalog, showcase assignments, deterministic fallback selection, and shared SVG renderer. `LandingPage` consumes the module for deck and directory art, while its existing filament renderer becomes story-fallback-only; uploaded story card variants take priority inside selected profiles.

**Tech Stack:** React 19, TypeScript, inline SVG, Tailwind 4, Vitest, Testing Library, Vite.

## Global Constraints

- Create exactly five stable preset IDs: `sitting`, `waving`, `leaning`, `walking`, and `floating`.
- Do not add profile-editing UI, a database column, an API field, uploads, AI-generated assets, animation, dependencies, filters, blur, gradients, or generated noise.
- Use only `--neon-1`, `--neon-2`, `--neon-3`, and `--neon-4` for figure colors over `#08070b`.
- Featured deck cards and directory icons use profile presets; selected-profile headers remain handle and bio only.
- Uploaded story covers may render only on story tiles inside selected profiles.
- Unknown profile IDs must resolve deterministically to one of the five presets.
- Preserve handles, bios, search, carousel, navigation, curated story covers, and filament story fallbacks.
- Work inline on the current local `main`; do not dispatch subagents or push.

---

### Task 1: Add the typed preset catalog and SVG renderer

**Files:**
- Create: `src/profile-avatars/profileAvatarPresets.ts`
- Create: `src/profile-avatars/profileAvatarPresets.test.ts`
- Create: `src/profile-avatars/ProfileAvatar.tsx`
- Create: `src/profile-avatars/ProfileAvatar.test.tsx`

**Interfaces:**
- Produces: `PROFILE_AVATAR_PRESET_IDS`, `ProfileAvatarPresetId`,
  `PROFILE_AVATAR_PRESETS`, `getProfileAvatarPresetId(profileId: string)`,
  and `ProfileAvatar({ compact?, presetId })`.
- Consumes: `createSeededRandom(seed: string)` from
  `src/utils/seededRandom.ts`.

- [ ] **Step 1: Write failing catalog tests**

Create `src/profile-avatars/profileAvatarPresets.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  PROFILE_AVATAR_PRESETS,
  PROFILE_AVATAR_PRESET_IDS,
  getProfileAvatarPresetId
} from "./profileAvatarPresets";

const APPROVED_COLORS = [
  "var(--neon-1)",
  "var(--neon-2)",
  "var(--neon-3)",
  "var(--neon-4)"
];

describe("profile avatar presets", () => {
  it("defines the five stable, visually distinct presets", () => {
    expect(PROFILE_AVATAR_PRESET_IDS).toEqual([
      "sitting",
      "waving",
      "leaning",
      "walking",
      "floating"
    ]);

    const geometry = PROFILE_AVATAR_PRESET_IDS.map((id) =>
      JSON.stringify(PROFILE_AVATAR_PRESETS[id])
    );

    expect(new Set(geometry)).toHaveLength(5);
  });

  it("uses only approved theme colors", () => {
    for (const preset of Object.values(PROFILE_AVATAR_PRESETS)) {
      expect(APPROVED_COLORS).toContain(preset.primaryColor);
      expect(APPROVED_COLORS).toContain(preset.secondaryColor);
    }
  });

  it("assigns the five showcase profiles explicitly", () => {
    expect(getProfileAvatarPresetId("user-phil")).toBe("sitting");
    expect(getProfileAvatarPresetId("user-demo-01")).toBe("waving");
    expect(getProfileAvatarPresetId("user-demo-02")).toBe("leaning");
    expect(getProfileAvatarPresetId("user-demo-03")).toBe("walking");
    expect(getProfileAvatarPresetId("user-demo-04")).toBe("floating");
  });

  it("selects a stable catalog fallback for an unknown profile", () => {
    const first = getProfileAvatarPresetId("user-future");
    const second = getProfileAvatarPresetId("user-future");

    expect(second).toBe(first);
    expect(PROFILE_AVATAR_PRESET_IDS).toContain(first);
  });
});
```

- [ ] **Step 2: Write the failing renderer tests**

Create `src/profile-avatars/ProfileAvatar.test.tsx`:

```tsx
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
    const strokes = [...(svg?.querySelectorAll("[data-figure-stroke]") ?? [])];

    expect(svg).toHaveAttribute("data-avatar-variant", "compact");
    expect(svg).toHaveAttribute("viewBox", "0 45 300 300");
    expect(strokes.every((stroke) =>
      Number(stroke.getAttribute("stroke-width")) >= 7
    )).toBe(true);
  });
});
```

- [ ] **Step 3: Run the new tests and verify RED**

Run:

```powershell
npx vitest run src/profile-avatars/profileAvatarPresets.test.ts src/profile-avatars/ProfileAvatar.test.tsx
```

Expected: FAIL because neither module exists.

- [ ] **Step 4: Implement the typed catalog**

In `profileAvatarPresets.ts`, define:

```ts
export const PROFILE_AVATAR_PRESET_IDS = [
  "sitting",
  "waving",
  "leaning",
  "walking",
  "floating"
] as const;

export type ProfileAvatarPresetId =
  (typeof PROFILE_AVATAR_PRESET_IDS)[number];

type AvatarStroke = {
  color: "primary" | "secondary";
  d: string;
  opacity?: number;
  width: number;
};

type AvatarNode = {
  color: "primary" | "secondary";
  cx: number;
  cy: number;
  opacity?: number;
  r: number;
};

export type ProfileAvatarPreset = {
  id: ProfileAvatarPresetId;
  marks: readonly AvatarStroke[];
  nodes: readonly AvatarNode[];
  primaryColor: string;
  secondaryColor: string;
  strokes: readonly AvatarStroke[];
};
```

Populate all five poses with hand-authored `M`, `L`, `C`, and `Q` path
geometry. Each pose gets one head node, at least five figure strokes, and no
more than two faint `marks`. Use the exact assignments:

```ts
const SHOWCASE_ASSIGNMENTS: Record<string, ProfileAvatarPresetId> = {
  "user-phil": "sitting",
  "user-demo-01": "waving",
  "user-demo-02": "leaning",
  "user-demo-03": "walking",
  "user-demo-04": "floating"
};
```

For unknown IDs, call
`createSeededRandom(`${profileId}-profile-avatar`)()` once and map the result
into `PROFILE_AVATAR_PRESET_IDS`.

- [ ] **Step 5: Implement the shared SVG renderer**

`ProfileAvatar.tsx` accepts:

```ts
type ProfileAvatarProps = {
  compact?: boolean;
  presetId: ProfileAvatarPresetId;
};
```

Render one `<svg>` with `aria-hidden="true"`, `data-avatar-preset`,
`data-avatar-variant`, `preserveAspectRatio="xMidYMid slice"`, and
`className="h-full w-full"`. Render:

1. a `#08070b` background rectangle;
2. faint support marks;
3. figure strokes with `data-figure-stroke`;
4. figure nodes.

Resolve each stroke/node color role to the selected preset's primary or
secondary token. Multiply stroke width by `1.8` in compact mode and node radius
by `1.12`; use `0 45 300 300` for compact and `0 0 300 400` for full.

- [ ] **Step 6: Run the new tests and verify GREEN**

Run:

```powershell
npx vitest run src/profile-avatars/profileAvatarPresets.test.ts src/profile-avatars/ProfileAvatar.test.tsx
```

Expected: 6 tests pass.

- [ ] **Step 7: Commit the isolated avatar module**

```powershell
git add -- src/profile-avatars
git diff --cached
git commit -m "feat: add stick figure profile presets"
```

---

### Task 2: Use presets on profiles and keep imagery inside stories

**Files:**
- Modify: `src/components/LandingPage.tsx`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/data/platformSeed.ts`

**Interfaces:**
- Consumes: `ProfileAvatar` and `getProfileAvatarPresetId` from Task 1.
- Produces: preset-backed deck/directory art and the story-cover priority
  uploaded card variant → curated bundled cover → filament fallback.

- [ ] **Step 1: Write the failing landing integration test**

Replace the generated-profile-art assertions in
`cycles the featured deck and keeps logged-out browsing open` with:

```ts
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
    cardArt.querySelector(`[data-avatar-preset="${expectedPresets[index]}"]`)
  ).not.toBeNull();
});

const directory = screen.getByLabelText("All profiles");
const compactAvatars = directory.querySelectorAll(
  '[data-avatar-variant="compact"]'
);

expect(compactAvatars).toHaveLength(seedProfiles.length);
```

Update the old filter-oriented test to assert that the landing profile cards
contain no `filter`, `feGaussianBlur`, or `.profile-art__depth`.

- [ ] **Step 2: Write the failing uploaded-story-cover test**

Ensure the App test helper `toStoryCard()` includes:

```ts
coverImage: story.coverImage ?? null,
```

Add:

```tsx
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
    screen.getByTestId("profile-card-background-user-demo-01")
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
```

- [ ] **Step 3: Run integration tests and verify RED**

Run:

```powershell
npx vitest run src/App.test.tsx
```

Expected: FAIL because profile cards still use filament art and LandingPage
ignores `coverImage`.

- [ ] **Step 4: Integrate profile presets**

In `LandingPage.tsx`:

- import `ProfileAvatar` and `getProfileAvatarPresetId`;
- rename local `ProfileArtwork` to `StoryFallbackArtwork`;
- render `<ProfileAvatar presetId={getProfileAvatarPresetId(profile.id)} />`
  on deck cards;
- render the same component with `compact` in directory rows;
- keep `StoryFallbackArtwork handle={story.storyId}` only in uncovered story
  tiles.

Do not render `profile.avatarImage` anywhere on the public landing surface.

- [ ] **Step 5: Honor story cover references**

For each selected-profile story:

```ts
const uploadedCover = story.coverImage?.variants.card;
const curatedCover = STORY_COVERS[story.storyId];
const storyCover = uploadedCover
  ? { image: uploadedCover, objectPosition: "50% 50%" }
  : curatedCover;
```

Use the existing `<img>` branch when `storyCover` exists and the renamed
filament fallback otherwise.

Add `coverImage: record.coverImage ?? null` to `App.tsx`'s `toStoryCard()` and
`coverImage: story.coverImage ?? null` to
`src/data/platformSeed.ts`'s `toStoryCard()` so local updates and browser
fallback data preserve the same card shape.

- [ ] **Step 6: Run focused integration verification**

Run:

```powershell
npx vitest run src/profile-avatars src/utils/profileArt.test.ts src/App.test.tsx src/data/platformSeed.test.ts
```

Expected: all focused tests pass. Existing curated-cover and distinct
filament-story-fallback tests remain green.

- [ ] **Step 7: Commit landing integration**

```powershell
git add -- src/components/LandingPage.tsx src/App.tsx src/App.test.tsx src/data/platformSeed.ts
git diff --cached
git commit -m "feat: use stick figure profile art"
```

---

### Task 3: Verify visual distinction and application health

**Files:**
- Modify only if verification exposes a defect, with a failing regression test first.

**Interfaces:**
- Consumes: the complete profile-avatar integration.
- Produces: a clean local `main` with the five profiles visually verified and
  the dev preview left available at `http://127.0.0.1:5174/`.

- [ ] **Step 1: Verify the landing at desktop size**

At `1280×720`, confirm:

- all five featured cards expose different `data-avatar-preset` values;
- poses are recognizable and sparse;
- card text remains legible;
- directory icons use compact variants;
- no profile card contains `<img>`, `<filter>`, or `<animate>`;
- the console has no errors.

- [ ] **Step 2: Verify the landing at mobile size**

At `390×844` and `375` CSS pixels, confirm:

- compact figures remain distinguishable;
- the deck and directory do not overflow horizontally;
- the center card text remains readable;
- `document.documentElement.scrollWidth ===
  document.documentElement.clientWidth`.

- [ ] **Step 3: Verify story image isolation**

Enter `@phil` and `@demo-01`. Confirm curated story images remain inside the
story grid, uncovered stories use filament fallbacks, and none of those images
appear on home profile cards.

- [ ] **Step 4: Run full verification**

Run:

```powershell
$env:TEST_DATABASE_URL='postgresql://chatsim_dev:chatsim_dev@127.0.0.1:55439/chatsim_test'
$env:DATABASE_URL='postgresql://chatsim_dev:chatsim_dev@127.0.0.1:55439/chatsim_dev'
npm test
npx tsc -b
npm run build
git diff --check
git status --short --branch
```

Expected: every test passes, TypeScript and the production build exit zero,
`git diff --check` prints no errors, and the worktree is clean after commits.
