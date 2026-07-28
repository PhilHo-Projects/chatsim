# Landing Neon Theme and Profile Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the light/dark browsing shell with one near-black neon theme, and reduce a profile to a handle plus a description with generated card art.

**Architecture:** Backend first — add the `bio` column and stop manufacturing display names — then the canonical fixture, then the theme foundation, then the components that consume it. Each task leaves the app running.

**Tech Stack:** Vite, React 19, TypeScript, Tailwind 4, Postgres 16, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-07-27-landing-neon-theme-and-identity-design.md`

## Global Constraints

- Neon tokens are exactly `--neon-1 #ff2d78`, `--neon-2 #22d3ee`, `--neon-3 #a855f7`, `--neon-4 #38bdf8`. Base is `#050507`.
- Background density is 22 tendrils and 26 nodes.
- `bio` is `text`, nullable, `char_length(bio) <= 160`. Never `varchar`.
- Blur is applied to static layers only. Only `transform` and `stroke-dashoffset` may animate. Never animate `filter`, and never put a dash animation inside a blurred layer.
- Generated art may only use the four neon tokens. No free-floating hue.
- Never reintroduce a wide-blurred "haze" layer over the whole field.
- Deck mechanics in `LandingPage.tsx` (`getDeckOffset`, `getDeckCardStyle`, `MAX_VISIBLE_OFFSET`, the inline `min(18rem, 62vw)` width, the explicit transition property list) stay as they are. Never switch the card transition to `transition-all`.
- The phone player and both script editors are out of scope. Do not touch `PhoneShell`, `ScriptEditor`, `BattleScriptEditor`, or `BattleStoryPlayer`.
- Postgres must be running for backend tests: `npm run dev:db`.

---

### Task 1: Add `bio` to the database and stop manufacturing display names

**Files:**
- Create: `server/db/migrations/007_user_bio.sql`
- Modify: `server/storyStore.ts` (types ~line 72, `getPublicProfiles` ~line 523, `register` ~line 720, `updateCurrentUser` ~line 949)
- Modify: `server/validation.ts:69-78`
- Test: `server/storyStore.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `PublicProfile.bio: string | null`; `updateCurrentUser(userId, patch: { avatarImageId?: string | null; bio?: string | null; displayName?: string })`; `register` now defaults `display_name` to the bare username.

- [ ] **Step 1: Write the failing test**

Add to `server/storyStore.test.ts`, inside the top-level `describe`:

```ts
it("stores a bio and defaults display name to the bare username", async () => {
  const session = await store.register({
    password: "correct-horse-battery",
    username: "biotester"
  });

  expect(session.user.displayName).toBe("biotester");

  await store.updateCurrentUser(session.user.id, { bio: "just here to test" });

  const profiles = await store.getPublicProfiles();
  const profile = profiles.find((entry) => entry.username === "biotester");

  expect(profile?.bio).toBe("just here to test");
});

it("rejects a bio over 160 characters", async () => {
  const session = await store.register({
    password: "correct-horse-battery",
    username: "biolimit"
  });

  await expect(
    store.updateCurrentUser(session.user.id, { bio: "x".repeat(161) })
  ).rejects.toThrow();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run dev:db && npx vitest run server/storyStore.test.ts -t "bio"`
Expected: FAIL. The first test fails on `displayName` being `"biotester's stories"`; both fail on `bio` not existing.

- [ ] **Step 3: Create the migration**

Create `server/db/migrations/007_user_bio.sql`:

```sql
ALTER TABLE users
  ADD COLUMN bio TEXT;

ALTER TABLE users
  ADD CONSTRAINT users_bio_check
  CHECK (bio IS NULL OR char_length(bio) <= 160);
```

Migrations are checksummed by `003_schema_migration_checksums.sql`. Once this file has been applied, editing it will fail the checksum guard — if you need to change it, roll the database with `npm run dev:db:reset` rather than editing in place.

- [ ] **Step 4: Add `bio` to the store types and queries**

In `server/storyStore.ts`, add `bio: string | null;` to the `UserRow` type (alphabetically, after `avatar_image_id`) and to `PublicProfile` (after `avatarImage`).

In `getPublicProfiles`, add `bio` to the `Pick<UserRow, ...>` union and to the `SELECT`:

```ts
      Pick<
        UserRow,
        | "accent_color"
        | "avatar_image_id"
        | "bio"
        | "display_name"
        | "id"
        | "username"
      > &
        ImageJoin
```

```sql
       SELECT
         u.id,
         u.username,
         u.display_name,
         u.bio,
         u.accent_color,
         u.avatar_image_id,
```

and in the returned object literal, after `avatarImage`:

```ts
      bio: user.bio,
```

- [ ] **Step 5: Stop manufacturing display names in `register`**

In `server/storyStore.ts`, change the `display_name` default (currently line 720):

```ts
      display_name: input.displayName?.trim() || username,
```

This is the single source of `phil's stories`. Existing rows are not rewritten by this change; the fixture handles those in Task 2.

- [ ] **Step 6: Accept `bio` in `updateCurrentUser`**

Widen the patch parameter and the `UPDATE`:

```ts
  async updateCurrentUser(
    userId: string,
    patch: {
      avatarImageId?: string | null;
      bio?: string | null;
      displayName?: string;
    }
  ) {
```

```sql
        `UPDATE users
         SET display_name = COALESCE($1, display_name),
             bio = CASE WHEN $6::boolean THEN $7 ELSE bio END,
             avatar_image_id = CASE
               WHEN $2::boolean THEN $3
               ELSE avatar_image_id
             END,
             updated_at = $4
         WHERE id = $5
         RETURNING *`,
```

```ts
        [
          patch.displayName,
          patch.avatarImageId !== undefined,
          patch.avatarImageId ?? null,
          this.now(),
          userId,
          patch.bio !== undefined,
          patch.bio ?? null
        ]
```

The `CASE WHEN ... THEN ... ELSE bio END` shape (rather than `COALESCE`) is what lets a caller clear a bio by sending `null`, while a caller who omits the field leaves it untouched.

- [ ] **Step 7: Allow `bio` through validation**

In `server/validation.ts`, replace `userPatchSchema`:

```ts
export const userPatchSchema = z
  .object({
    avatarImageId: identifier.nullable().optional(),
    bio: z.string().trim().max(160).nullable().optional(),
    displayName: z.string().trim().min(1).max(80).optional()
  })
  .refine(
    (input) =>
      input.avatarImageId !== undefined ||
      input.bio !== undefined ||
      input.displayName !== undefined,
    "At least one profile field is required."
  );
```

- [ ] **Step 8: Apply the migration and run the tests**

Run: `npm run db:migrate && npx vitest run server/storyStore.test.ts`
Expected: PASS, including the two new tests.

- [ ] **Step 9: Commit**

```bash
git add server/db/migrations/007_user_bio.sql server/storyStore.ts server/validation.ts server/storyStore.test.ts
git commit -m "feat: add profile bio and drop manufactured display names"
```

---

### Task 2: Rewrite the canonical fixture to handle-only demo profiles

**Files:**
- Modify: `src/data/platformSeed.json`
- Modify: `src/data/platformSeed.ts:35-42`, `:93-103`
- Test: `src/data/platformSeed.test.ts:11-22`

**Interfaces:**
- Consumes: `PublicProfile.bio` from Task 1.
- Produces: `PlatformProfile.bio: string | null`; profile ids `user-demo-01` … `user-demo-04`; story ids `story-demo-01-1` … `story-demo-04-1`.

- [ ] **Step 1: Write the failing test**

Replace the first test in `src/data/platformSeed.test.ts`:

```ts
  it("uses one credential-free canonical fixture of handle-only profiles", () => {
    expect(canonicalSeed.users).toHaveLength(5);
    expect(canonicalSeed.stories).toHaveLength(6);
    expect(canonicalSeed.users.map((user) => user.username)).toEqual([
      "phil",
      "demo-01",
      "demo-02",
      "demo-03",
      "demo-04"
    ]);
    expect(JSON.stringify(canonicalSeed)).not.toMatch(
      /passwordHash|passwordSalt|sessions/
    );
  });

  it("gives every profile a bio and no invented title", () => {
    for (const user of canonicalSeed.users) {
      expect(user.bio.length).toBeGreaterThan(0);
      expect(user.bio.length).toBeLessThanOrEqual(160);
      expect(user.displayName).toBe(user.username);
    }

    expect(seedProfiles.every((profile) => profile.bio)).toBe(true);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/data/platformSeed.test.ts`
Expected: FAIL with usernames `["phil","neon","orbit","motel","void"]` and `user.bio` undefined.

- [ ] **Step 3: Rewrite the fixture users**

In `src/data/platformSeed.json`, replace the entire `users` array:

```json
  "users": [
    {
      "accentColor": "#ff2d78",
      "bio": "chaotic texts i never should have sent",
      "createdAt": "2026-05-28T00:00:00.000Z",
      "displayName": "phil",
      "id": "user-phil",
      "role": "member",
      "username": "phil"
    },
    {
      "accentColor": "#22d3ee",
      "bio": "generated account, one placeholder story",
      "createdAt": "2026-05-28T00:00:00.000Z",
      "displayName": "demo-01",
      "id": "user-demo-01",
      "role": "member",
      "username": "demo-01"
    },
    {
      "accentColor": "#a855f7",
      "bio": "generated account, one placeholder story",
      "createdAt": "2026-05-28T00:00:00.000Z",
      "displayName": "demo-02",
      "id": "user-demo-02",
      "role": "member",
      "username": "demo-02"
    },
    {
      "accentColor": "#38bdf8",
      "bio": "generated account, one placeholder story",
      "createdAt": "2026-05-28T00:00:00.000Z",
      "displayName": "demo-03",
      "id": "user-demo-03",
      "role": "member",
      "username": "demo-03"
    },
    {
      "accentColor": "#ff6bb0",
      "bio": "generated account, one placeholder story",
      "createdAt": "2026-05-28T00:00:00.000Z",
      "displayName": "demo-04",
      "id": "user-demo-04",
      "role": "member",
      "username": "demo-04"
    }
  ],
```

`displayName` is kept in the fixture only because the column is still `NOT NULL`. It now always equals the username, so nothing renders it.

- [ ] **Step 4: Repoint the four placeholder stories**

In the same file, for each of the four non-phil stories, change `id` and `ownerId` and leave everything else alone:

| Old `id` | New `id` | New `ownerId` |
| --- | --- | --- |
| `story-neon-1` | `story-demo-01-1` | `user-demo-01` |
| `story-orbit-1` | `story-demo-02-1` | `user-demo-02` |
| `story-motel-1` | `story-demo-03-1` | `user-demo-03` |
| `story-void-1` | `story-demo-04-1` | `user-demo-04` |

Leave `story-phil-1` and `story-phil-battle` untouched.

- [ ] **Step 5: Add `bio` to the frontend profile type**

In `src/data/platformSeed.ts`, add to `PlatformProfile` (after `avatarImage`):

```ts
  bio: string | null;
```

and in the `seedProfiles` mapping (after `accentColor`):

```ts
    bio: user.bio,
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run src/data/platformSeed.test.ts`
Expected: PASS.

- [ ] **Step 7: Reseed and verify the prune**

Run:

```bash
npm run db:seed && docker exec story-postgres-1 psql -U chatsim_dev -d chatsim_dev -c "select username, bio from users order by created_at;"
```

Expected: exactly five rows — `phil`, `demo-01` … `demo-04` — each with a bio. The old `neon`/`orbit`/`motel`/`void` rows and their four stories are gone, deleted by the seed's prune of credential-free owners absent from the fixture. This is expected and was accepted in the spec.

- [ ] **Step 8: Commit**

```bash
git add src/data/platformSeed.json src/data/platformSeed.ts src/data/platformSeed.test.ts
git commit -m "feat: make seeded profiles handle-only with bios"
```

---

### Task 3: Install the neon tokens and delete light mode

**Files:**
- Modify: `src/index.css`
- Modify: `src/App.tsx:48-72`, `:212`, `:355-365`, `:952-959`
- Modify: `src/components/AppShell.tsx` (whole file)
- Test: `src/indexCss.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: CSS variables `--neon-1` … `--neon-4`, `--base`, `--surface`, `--line`, `--text`, `--muted` on `:root`. `AppShellProps` no longer has `theme` or `onToggleTheme`.

- [ ] **Step 1: Rewrite the failing style test**

Replace `src/indexCss.test.ts` entirely. The existing test asserts on `landing-minimal-sky.webp`, which this task removes:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("app theme tokens", () => {
  it("defines the four neon tokens on a near-black base", () => {
    const css = readFileSync("src/index.css", "utf8");

    expect(css).toContain("--neon-1: #ff2d78");
    expect(css).toContain("--neon-2: #22d3ee");
    expect(css).toContain("--neon-3: #a855f7");
    expect(css).toContain("--neon-4: #38bdf8");
    expect(css).toContain("--base: #050507");
  });

  it("carries no light-mode variant for the shell", () => {
    const css = readFileSync("src/index.css", "utf8");

    expect(css).not.toContain("@custom-variant dark");
    expect(css).not.toContain("landing-minimal-sky.webp");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/indexCss.test.ts`
Expected: FAIL — tokens not found, `@custom-variant dark` still present.

- [ ] **Step 3: Replace the theme block in `src/index.css`**

Replace everything from `@custom-variant dark` through the final `.dark .app-background--story::after` rule with:

```css
:root {
  --neon-1: #ff2d78;
  --neon-2: #22d3ee;
  --neon-3: #a855f7;
  --neon-4: #38bdf8;
  --base: #050507;
  --surface: rgba(10, 9, 13, 0.62);
  --line: rgba(255, 255, 255, 0.09);
  --text: #f6eef4;
  --muted: #9a8d99;

  color-scheme: dark;
  font-synthesis: none;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

.app-background {
  background: var(--base);
  isolation: isolate;
  min-height: 100dvh;
}

/* Glass substrate. At 22 tendrils the neon cuts through body text, so any
   panel carrying prose sits on this rather than directly on the field. */
.app-glass {
  background: var(--surface);
  backdrop-filter: blur(20px) saturate(1.1);
  border: 1px solid var(--line);
}
```

Then delete, precisely:

- the old `:root` and `.dark` blocks
- `.app-background--landing::before` and `.app-background--landing::after` (the neon background replaces them)
- every `.dark .app-background*` override

**Keep** the shared `.app-background::before, .app-background::after` base rule and both `.app-background--story::before` / `::after` rules. The story route still passes `app-background--story` as `backgroundModeClass`, and the coffee-shop treatment behind the phone player is explicitly out of scope. Deleting them leaves the player on a flat black field.

Also keep the `bubble-in`, `typing-dot`, `battle-*` keyframes and the `prefers-reduced-motion` block at the bottom exactly as they are — the phone and battle players still use them.

Because `.app-background` now sets `background: var(--base)`, check the story route in the browser at the end of this task: the coffee-shop image should still paint over the near-black base.

- [ ] **Step 4: Strip theme state from `src/App.tsx`**

Delete `THEME_STORAGE_KEY` (line 49), the `Theme` type (line 51), `getInitialTheme` (lines 53-72), the `theme` state (line 212), the `useEffect` that toggles the `dark` class and writes storage (lines 355-362), and `toggleTheme` (lines 364-366).

Remove `theme={theme}` and `onToggleTheme={toggleTheme}` from the `<AppShell>` call.

- [ ] **Step 5: Strip theme from `AppShell.tsx`**

Delete the `Theme` type, the `theme` and `onToggleTheme` props from `AppShellProps`, the `isDark` / `themeToggleLabel` / `ThemeIcon` locals, both theme-toggle buttons (the one in the left rail and the one in the top bar), and the now-unused `Moon` and `Sun` imports from `lucide-react`.

Then remove every `dark:` variant class in the file, keeping the dark half of each pair as the unconditional value. For example:

```tsx
// before
className="... bg-white/95 ... dark:bg-slate-950/85"
// after
className="... bg-[color:var(--surface)] ..."
```

Apply the same treatment to the 14 `dark:` variants in `LandingPage.tsx` — Task 6 rewrites that file, so it is enough here to leave it compiling.

- [ ] **Step 6: Run the tests and the type check**

Run: `npx vitest run src/indexCss.test.ts && npx tsc -b`
Expected: both PASS. `tsc` catching an unused `Theme` import means step 5 missed something.

- [ ] **Step 7: Commit**

```bash
git add src/index.css src/App.tsx src/components/AppShell.tsx src/components/LandingPage.tsx src/indexCss.test.ts
git commit -m "feat: replace light/dark shell with neon theme tokens"
```

---

### Task 4: Build the animated neon background

**Files:**
- Create: `src/utils/seededRandom.ts`
- Create: `src/components/NeonBackground.tsx`
- Create: `src/components/NeonBackground.test.tsx`
- Modify: `src/index.css` (append the background layer rules)
- Modify: `src/components/AppShell.tsx` (render it once, behind everything)

**Interfaces:**
- Consumes: the CSS variables from Task 3.
- Produces: `createSeededRandom(seed: string): () => number` from `src/utils/seededRandom.ts` — **Task 5 imports this same function, do not write a second copy.** Also `<NeonBackground />`, a component taking no props, and `buildTendrils(count: number): Tendril[]` where `Tendril = { color: string; d: string; dash: number; delay: number; duration: number; width: number }`.

- [ ] **Step 0: Extract the shared seeded RNG**

Both this task and Task 5 need reproducible pseudo-randomness. It lives in one
place. Create `src/utils/seededRandom.ts`:

```ts
/**
 * FNV-1a derived generator. Deterministic for a given seed, so generated
 * geometry is identical on every load and in every test snapshot rather
 * than changing per render.
 */
export function createSeededRandom(seed: string): () => number {
  let hash = 2166136261;

  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return () => {
    hash = Math.imul(hash ^ (hash >>> 15), 2246822507);
    return ((hash >>> 0) % 100000) / 100000;
  };
}
```

In the two implementation steps below, import it rather than redefining it:

```ts
import { createSeededRandom } from "../utils/seededRandom";
```

The code blocks in Task 4 and Task 5 already import it. Neither file defines its
own FNV implementation — if you find yourself writing one, you are duplicating
this module.

- [ ] **Step 1: Write the failing test**

Create `src/components/NeonBackground.test.tsx`:

```tsx
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/NeonBackground.test.tsx`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement the component**

Create `src/components/NeonBackground.tsx`:

```tsx
import { createSeededRandom } from "../utils/seededRandom";

/** Tendril count and node count are fixed by the design spec. */
const TENDRIL_COUNT = 22;
const NODE_COUNT = 26;

/** Fixed seed, so the field is identical on every load and in every snapshot. */
const SEED = "chatsim-tendrils-v2";

const NEON = [
  "var(--neon-1)",
  "var(--neon-2)",
  "var(--neon-3)",
  "var(--neon-4)"
] as const;

export type Tendril = {
  color: string;
  d: string;
  dash: number;
  delay: number;
  duration: number;
  width: number;
};

/**
 * A smooth cubic chain crossing the full width. `amp` scales the vertical
 * wander, so some read as taut filaments and others as slack loops.
 */
function tendrilPath(next: () => number, startY: number, amp: number) {
  const segments = 4 + Math.floor(next() * 3);
  const step = 1800 / segments;
  let d = `M-100,${startY.toFixed(0)}`;
  let x = -100;
  let y = startY;
  let direction = next() > 0.5 ? 1 : -1;

  for (let index = 0; index < segments; index += 1) {
    const nextX = x + step;
    const nextY = y + direction * amp * (0.5 + next());

    d +=
      ` C${(x + step * 0.4).toFixed(0)},${(y + direction * amp * 0.9).toFixed(0)}` +
      ` ${(nextX - step * 0.4).toFixed(0)},${(nextY - direction * amp * 0.9).toFixed(0)}` +
      ` ${nextX.toFixed(0)},${nextY.toFixed(0)}`;

    x = nextX;
    y = nextY;
    direction *= -1;
  }

  return d;
}

export function buildTendrils(count: number): Tendril[] {
  const next = createSeededRandom(SEED);

  return Array.from({ length: count }, () => {
    const startY = -60 + next() * 1020;
    const amp = 40 + next() * 150;

    return {
      color: NEON[Math.floor(next() * NEON.length)],
      d: tendrilPath(next, startY, amp),
      dash: 160 + Math.floor(next() * 420),
      delay: -next() * 40,
      duration: 16 + next() * 34,
      width: 0.7 + next() * 1.1
    };
  });
}

function buildNodes(count: number) {
  const next = createSeededRandom(`${SEED}-nodes`);

  return Array.from({ length: count }, (_unused, index) => ({
    color: NEON[Math.floor(next() * NEON.length)],
    cx: Math.round(next() * 1600),
    cy: Math.round(next() * 900),
    delay: -next() * 9,
    duration: 4 + next() * 7,
    key: `node-${index}`,
    r: 1.2 + next() * 2.6
  }));
}

/**
 * Two copies of the same geometry: a thick blurred copy for the glow, a thin
 * bright copy in plus-lighter for the filament core. The blur lives on the
 * layer and is never recomputed; only transform and stroke-dashoffset animate.
 */
export function NeonBackground() {
  const tendrils = buildTendrils(TENDRIL_COUNT);
  const nodes = buildNodes(NODE_COUNT);

  return (
    <div aria-hidden="true" className="neon-bg">
      <div className="neon-bg__blooms" />
      <svg
        className="neon-bg__glow"
        preserveAspectRatio="xMidYMid slice"
        viewBox="0 0 1600 900"
      >
        {tendrils.map((tendril, index) => (
          <path
            key={`glow-${index}`}
            d={tendril.d}
            fill="none"
            stroke={tendril.color}
            strokeLinecap="round"
            strokeWidth={tendril.width * 3.6}
          />
        ))}
      </svg>
      <svg
        className="neon-bg__core"
        preserveAspectRatio="xMidYMid slice"
        viewBox="0 0 1600 900"
      >
        {tendrils.map((tendril, index) => (
          <path
            key={`core-${index}`}
            d={tendril.d}
            fill="none"
            stroke={tendril.color}
            strokeDasharray={`${tendril.dash} ${tendril.dash * 4}`}
            strokeLinecap="round"
            strokeWidth={tendril.width}
            style={{
              animation: `neon-flow ${tendril.duration.toFixed(1)}s linear ${tendril.delay.toFixed(1)}s infinite`
            }}
          />
        ))}
        {nodes.map((node) => (
          <circle
            key={node.key}
            cx={node.cx}
            cy={node.cy}
            fill={node.color}
            r={node.r}
            style={{
              animation: `neon-pulse ${node.duration.toFixed(1)}s ease-in-out ${node.delay.toFixed(1)}s infinite`
            }}
          />
        ))}
      </svg>
      <div className="neon-bg__vignette" />
    </div>
  );
}
```

- [ ] **Step 4: Append the layer styles to `src/index.css`**

```css
/* --- Neon background ---
   Blur is baked into a static layer and never recomputed. Only transform and
   stroke-dashoffset animate. Do not move the dash animation into .neon-bg__glow:
   that forces a full-viewport re-blur every frame. */

.neon-bg {
  position: fixed;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  pointer-events: none;
}

.neon-bg svg {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
}

.neon-bg__blooms {
  position: absolute;
  inset: -30%;
  opacity: 0.16;
  filter: blur(110px);
  background:
    radial-gradient(30% 34% at 20% 24%, var(--neon-1), transparent 70%),
    radial-gradient(28% 30% at 82% 18%, var(--neon-3), transparent 70%),
    radial-gradient(34% 36% at 70% 84%, var(--neon-2), transparent 70%),
    radial-gradient(26% 30% at 12% 82%, var(--neon-4), transparent 70%);
  animation: neon-drift-a 61s ease-in-out infinite alternate;
  will-change: transform;
}

.neon-bg__glow {
  opacity: 1;
  filter: blur(13px);
  mix-blend-mode: screen;
  animation: neon-drift-b 88s ease-in-out infinite alternate;
  will-change: transform;
}

.neon-bg__core {
  mix-blend-mode: plus-lighter;
  animation: neon-drift-b 88s ease-in-out infinite alternate;
  will-change: transform;
}

/* Light touch only. Anything heavier and the tendrils vanish into the base. */
.neon-bg__vignette {
  position: absolute;
  inset: 0;
  background: radial-gradient(
    86% 70% at 50% 44%,
    rgba(5, 5, 7, 0) 40%,
    rgba(5, 5, 7, 0.45) 100%
  );
}

@keyframes neon-drift-a {
  from { transform: translate3d(0, 0, 0) scale(1); }
  to { transform: translate3d(5%, -4%, 0) scale(1.14); }
}

@keyframes neon-drift-b {
  from { transform: translate3d(0, 0, 0) scale(1.04) rotate(0deg); }
  to { transform: translate3d(-3%, 2%, 0) scale(1.1) rotate(1.6deg); }
}

@keyframes neon-flow {
  to { stroke-dashoffset: -2400; }
}

@keyframes neon-pulse {
  0%, 100% { opacity: 0.25; }
  50% { opacity: 1; }
}
```

The existing `prefers-reduced-motion` block at the bottom of the file already zeroes every animation duration, so the background is covered without a new rule.

- [ ] **Step 5: Mount it in `AppShell.tsx`**

Import `NeonBackground` and render it as the first child of the root `div`, before the desktop nav:

```tsx
      <NeonBackground />
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run src/components/NeonBackground.test.tsx`
Expected: PASS, four tests.

- [ ] **Step 7: Commit**

```bash
git add src/components/NeonBackground.tsx src/components/NeonBackground.test.tsx src/index.css src/components/AppShell.tsx
git commit -m "feat: add animated neon tendril background"
```

---

### Task 5: Build the generated profile art module

**Files:**
- Create: `src/utils/profileArt.ts`
- Create: `src/utils/profileArt.test.ts`

**Interfaces:**
- Consumes: the neon tokens from Task 3, and `createSeededRandom` from `src/utils/seededRandom.ts` (created in Task 4). **Import it — do not write a second FNV implementation in this file.**
- Produces: `buildProfileArt(handle: string, options?: { compact?: boolean }): ProfileArt` where `ProfileArt = { nodes: ArtNode[]; strokes: ArtStroke[]; viewBox: string }`, `ArtStroke = { color: string; d: string; opacity: number; width: number }`, `ArtNode = { color: string; cx: number; cy: number; r: number }`.

Returning data rather than an SVG string keeps it assertable in tests and lets the consumer render real React elements instead of `dangerouslySetInnerHTML`.

- [ ] **Step 1: Write the failing test**

Create `src/utils/profileArt.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildProfileArt } from "./profileArt";

const NEON = [
  "var(--neon-1)",
  "var(--neon-2)",
  "var(--neon-3)",
  "var(--neon-4)"
];

describe("generated profile art", () => {
  it("returns the same art for the same handle", () => {
    expect(buildProfileArt("phil")).toEqual(buildProfileArt("phil"));
  });

  it("returns different art for different handles", () => {
    expect(buildProfileArt("phil")).not.toEqual(buildProfileArt("demo-01"));
  });

  it("only ever uses the four neon tokens", () => {
    for (const handle of ["phil", "demo-01", "demo-02", "demo-03", "demo-04"]) {
      const art = buildProfileArt(handle);

      for (const stroke of art.strokes) {
        expect(NEON).toContain(stroke.color);
      }

      for (const node of art.nodes) {
        expect(NEON).toContain(node.color);
      }
    }
  });

  it("renders a squarer, heavier mark in compact mode", () => {
    const full = buildProfileArt("phil");
    const compact = buildProfileArt("phil", { compact: true });

    expect(full.viewBox).toBe("0 0 300 400");
    expect(compact.viewBox).toBe("0 0 300 300");
    expect(compact.strokes.length).toBeLessThan(full.strokes.length);
    expect(compact.strokes[0].width).toBeGreaterThan(full.strokes[0].width);
  });
});
```

The compact assertions matter: a full 300×400 mark sliced into a 36 px row avatar reads as an empty smudge.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/utils/profileArt.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement the module**

Create `src/utils/profileArt.ts`:

```ts
import { createSeededRandom } from "./seededRandom";

const NEON = [
  "var(--neon-1)",
  "var(--neon-2)",
  "var(--neon-3)",
  "var(--neon-4)"
] as const;

export type ArtStroke = {
  color: string;
  d: string;
  opacity: number;
  width: number;
};

export type ArtNode = {
  color: string;
  cx: number;
  cy: number;
  r: number;
};

export type ProfileArt = {
  nodes: ArtNode[];
  strokes: ArtStroke[];
  viewBox: string;
};

/**
 * Deterministic filament art for a handle, in the same visual language as the
 * background. Colours come only from the neon tokens, so generated art can
 * never introduce a colour the theme does not own.
 *
 * `compact` renders fewer, thicker lines into a square box for small avatars.
 */
export function buildProfileArt(
  handle: string,
  options: { compact?: boolean } = {}
): ProfileArt {
  const compact = options.compact === true;
  const next = createSeededRandom(`${handle}-art`);
  const lineCount = compact ? 3 : 6;
  const gap = compact ? 88 : 66;
  const strokes: ArtStroke[] = [];
  const nodes: ArtNode[] = [];

  for (let index = 0; index < lineCount; index += 1) {
    const y = 30 + index * gap + next() * 34;
    const color = NEON[Math.floor(next() * NEON.length)];
    const controlOneX = 40 + next() * 200;
    const controlTwoX = 60 + next() * 200;

    strokes.push({
      color,
      d:
        `M-20,${y.toFixed(0)}` +
        ` C${controlOneX.toFixed(0)},${(y - 80 + next() * 50).toFixed(0)}` +
        ` ${controlTwoX.toFixed(0)},${(y + 80 - next() * 50).toFixed(0)}` +
        ` 320,${(y + 24 - next() * 48).toFixed(0)}`,
      opacity: Number((0.45 + next() * 0.45).toFixed(2)),
      width: Number(((compact ? 4 : 0.8) + next() * 1.4).toFixed(2))
    });

    if (index % 2 === 0) {
      nodes.push({
        color,
        cx: Math.round(40 + next() * 220),
        cy: Math.round(y),
        r: Number(((compact ? 5 : 1.5) + next() * 2).toFixed(1))
      });
    }
  }

  return {
    nodes,
    strokes,
    viewBox: compact ? "0 0 300 300" : "0 0 300 400"
  };
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/utils/profileArt.test.ts`
Expected: PASS, four tests.

- [ ] **Step 5: Commit**

```bash
git add src/utils/profileArt.ts src/utils/profileArt.test.ts
git commit -m "feat: generate deterministic profile art from handles"
```

---

### Task 6: Rewrite the landing page around handles

**Files:**
- Modify: `src/components/LandingPage.tsx` (whole file)
- Modify: `src/components/AppShell.tsx` (remove the search field and the `isHomeBrowsing` height switch)
- Modify: `src/App.tsx` (pass `searchQuery` and `onSearchQueryChange` to `LandingPage` instead of `AppShell`)
- Test: `src/App.test.tsx:16-18`, `:144`, `:153`, `:678`

**Interfaces:**
- Consumes: `buildProfileArt` (Task 5), `PlatformProfile.bio` (Task 2).
- Produces: `LandingPageProps` gains `onSearchQueryChange: (value: string) => void`. `AppShellProps` loses `searchQuery` and `onSearchQueryChange`.

- [ ] **Step 1: Write the failing test**

Add to `src/App.test.tsx`:

```tsx
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
```

- [ ] **Step 2: Update the existing fixtures the rename breaks**

In `src/App.test.tsx`:
- line 18: `displayName: "phil's stories"` becomes `displayName: "phil"`
- line 144: `displayName: body.displayName || \`${body.username}'s stories\`` becomes `displayName: body.displayName || body.username`
- line 678: `name: seedProfiles[1].displayName` becomes `name: \`@${seedProfiles[1].username}\``
- add `bio: "chaotic texts i never should have sent"` to the `mockProfiles` entries and `bio: null` to the profile pushed on register

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/App.test.tsx`
Expected: FAIL — `@phil` not found, search still inside the top bar.

- [ ] **Step 4: Move search out of `AppShell`**

In `AppShell.tsx`, delete the `searchQuery` and `onSearchQueryChange` props, the `<label>` search block and its `else` branch spacer, the `isHomeBrowsing` constant, and the `topBarHeightClass` / `mainHeightClass` switches (use the `min-h-14` and `min-h-[calc(100dvh-56px)]` values unconditionally). Remove the now-unused `Search` import if the mobile nav no longer uses it.

In `App.tsx`, move `searchQuery={searchQuery}` and `onSearchQueryChange={setSearchQuery}` from the `<AppShell>` call to the `<LandingPage>` call.

- [ ] **Step 5: Rewrite the landing page**

In `LandingPage.tsx`:

Delete the seven cover-image imports, `PROFILE_COVERS`, `getProfileCover`, `ProfileCover`, `DEFAULT_STORY_CARD_CLASS`, and `getCoverFallbackStyle`. Keep `STORY_COVERS` — story covers are out of scope.

Add a small renderer used by both the deck card and the list row:

```tsx
import { buildProfileArt } from "../utils/profileArt";

function ProfileArtwork({
  compact = false,
  handle
}: {
  compact?: boolean;
  handle: string;
}) {
  const art = buildProfileArt(handle, { compact });

  return (
    <svg
      aria-hidden="true"
      className="h-full w-full"
      preserveAspectRatio="xMidYMid slice"
      viewBox={art.viewBox}
    >
      <rect fill="#08070b" height="400" width="300" x="0" y="0" />
      <g filter={`url(#profile-soft-${compact ? "c" : "f"})`} opacity="0.8">
        {art.strokes.map((stroke, index) => (
          <path
            key={`glow-${index}`}
            d={stroke.d}
            fill="none"
            opacity={stroke.opacity}
            stroke={stroke.color}
            strokeLinecap="round"
            strokeWidth={stroke.width}
          />
        ))}
      </g>
      {art.strokes.map((stroke, index) => (
        <path
          key={`core-${index}`}
          d={stroke.d}
          fill="none"
          opacity={stroke.opacity}
          stroke={stroke.color}
          strokeLinecap="round"
          strokeWidth={stroke.width}
        />
      ))}
      {art.nodes.map((node, index) => (
        <circle
          key={`node-${index}`}
          cx={node.cx}
          cy={node.cy}
          fill={node.color}
          r={node.r}
        />
      ))}
      <defs>
        <filter id={`profile-soft-${compact ? "c" : "f"}`}>
          <feGaussianBlur stdDeviation={compact ? 5 : 7} />
        </filter>
      </defs>
    </svg>
  );
}
```

Update `matchesProfileSearch` to drop the `displayName` branch, since there is no longer a title to match:

```tsx
function matchesProfileSearch(profile: PlatformProfile, query: string) {
  const handleQuery = query.replace(/^@+/, "");

  return (
    profile.username.toLowerCase().includes(handleQuery) ||
    (profile.bio ?? "").toLowerCase().includes(query)
  );
}
```

In the deck card body, replace the display-name span and handle span with the handle as the heading and the bio beneath:

```tsx
              <span className="relative z-10 grid h-full content-end gap-1.5 p-5">
                <span className="block truncate font-round text-2xl font-bold leading-tight text-[color:var(--text)]">
                  @{profile.username}
                </span>
                {profile.bio ? (
                  <span className="line-clamp-2 text-sm text-[color:var(--muted)]">
                    {profile.bio}
                  </span>
                ) : null}
                <span className="mt-1 w-fit rounded-full border border-[color:var(--neon-1)] px-2 py-0.5 text-[0.65rem] font-black uppercase tracking-[0.12em] text-[color:var(--neon-1)]">
                  {label}
                </span>
              </span>
```

Replace the card's `style` fallback (`getCoverFallbackStyle`) with the artwork, keeping `getDeckCardStyle(offset)`, the inline width and the explicit transition list untouched:

```tsx
              style={{
                ...getDeckCardStyle(offset),
                width: "min(18rem, 62vw)",
                transition: prefersReducedMotion
                  ? "none"
                  : "transform 500ms ease-out, opacity 500ms ease-out, filter 500ms ease-out"
              }}
```

and inside, replace the `<img>` block with `<ProfileArtwork handle={profile.username} />`. Change the card `aria-label` to `Open @${profile.username}, ${label}`.

Render the search field between the deck and the list, and put the list on glass:

```tsx
      <label className="app-glass mx-auto flex h-12 w-full max-w-md items-center gap-3 rounded-xl px-4 text-[color:var(--muted)]">
        <span className="sr-only">Search profiles</span>
        <Search aria-hidden="true" className="h-5 w-5 shrink-0" />
        <input
          aria-label="Search profiles"
          className="h-full min-w-0 flex-1 bg-transparent text-base font-semibold text-[color:var(--text)] outline-none placeholder:text-[color:var(--muted)]"
          onChange={(event) => onSearchQueryChange(event.target.value)}
          placeholder="Search profiles"
          type="search"
          value={searchQuery}
        />
      </label>

      <div aria-label="All profiles" className="app-glass w-full rounded-2xl px-4">
        <ul className="grid divide-y divide-[color:var(--line)]">
```

Each row gains a compact avatar and the bio:

```tsx
              <button
                type="button"
                aria-label={`Open @${profile.username}, ${storyCountLabel(profile.stories.length)}`}
                onClick={() => onSelectProfile(profile.id)}
                className="group flex w-full items-center gap-3 py-3 text-left transition hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--neon-1)]"
              >
                <span className="h-9 w-9 shrink-0 overflow-hidden rounded-lg border border-[color:var(--line)]">
                  <ProfileArtwork compact handle={profile.username} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-round text-base font-bold text-[color:var(--text)] group-hover:underline">
                    @{profile.username}
                  </span>
                  {profile.bio ? (
                    <span className="block truncate text-sm text-[color:var(--muted)]">
                      {profile.bio}
                    </span>
                  ) : null}
                </span>
                <span className="ml-auto shrink-0 text-xs font-bold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                  {storyCountLabel(profile.stories.length)}
                </span>
              </button>
```

In the selected-profile branch, replace the display-name heading with `@{selectedProfile.username}` and put the bio underneath in place of the `@handle ·` line.

Import `Search` from `lucide-react` in this file.

- [ ] **Step 6: Run the tests**

Run: `npx vitest run src/App.test.tsx && npx tsc -b`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/LandingPage.tsx src/components/AppShell.tsx src/App.tsx src/App.test.tsx
git commit -m "feat: rebuild landing page around handles, bios and generated art"
```

---

### Task 7: Fix the account panel anchor and drop the display-name field

**Files:**
- Modify: `src/components/AppShell.tsx` (move the account trigger into the top-right cluster)
- Modify: `src/components/AccountPanel.tsx:111-121`
- Modify: `src/App.tsx:209`, `:652`, `:678`, `:855`
- Modify: `src/api/storyApi.ts:249-253`
- Test: `src/App.test.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `register(input: { password: string; username: string })` — `displayName` removed. `AccountPanelProps` loses `displayName` and `onDisplayNameChange`.

- [ ] **Step 1: Write the failing test**

Add to `src/App.test.tsx`:

```tsx
  it("opens the account panel from the same cluster as its trigger", async () => {
    mockSession = null;
    render(<App />);
    await flushPlatformEffects();

    const triggers = screen.getAllByRole("button", { name: "Account" });
    fireEvent.click(triggers[0]);

    const panel = screen.getByRole("dialog", { name: "Account panel" });

    expect(triggers[0].parentElement).toBe(panel.parentElement);
  });

  it("registers with a handle and password only", async () => {
    mockSession = null;
    render(<App />);
    await flushPlatformEffects();

    fireEvent.click(screen.getAllByRole("button", { name: "Account" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    expect(screen.queryByLabelText("Display name")).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/App.test.tsx -t "account panel"`
Expected: FAIL — the trigger is in the left rail while the panel renders in the right cluster, so the parents differ.

- [ ] **Step 3: Move the account trigger**

In `AppShell.tsx`, delete the account button from the desktop left rail (the first button in the `<nav>`). Add it to the top-right cluster as the first child, immediately before `{toolbarActions}`:

```tsx
          <button
            type="button"
            aria-label="Account"
            title="Account"
            onClick={onAccountToggle}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-[color:var(--text)] transition hover:bg-white/[0.06]"
          >
            <UserCircle aria-hidden="true" className="h-5 w-5" />
          </button>
```

The mobile bottom-nav account button stays where it is. The panel already renders in this cluster, so button and panel now share a parent and no positioning logic is needed.

- [ ] **Step 4: Remove the display-name field**

In `AccountPanel.tsx`, delete the `displayName` and `onDisplayNameChange` props and the entire `{authMode === "register" ? (...) : null}` block containing the Display name label.

In `App.tsx`, delete the `displayName` state (line 209), the `displayName` field from the `handleAuthSubmit` argument type (line 652), the `displayName` argument in the `handleRegister` call (line 678), and the `displayName={displayName}` / `onDisplayNameChange={setDisplayName}` props (line 855).

In `src/api/storyApi.ts`, change the `register` input type to `{ password: string; username: string }`.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/App.test.tsx && npx tsc -b`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/AppShell.tsx src/components/AccountPanel.tsx src/App.tsx src/api/storyApi.ts src/App.test.tsx
git commit -m "fix: anchor account panel to its trigger and drop display name entry"
```

---

### Task 8: Retire the orphaned artwork to a fixtures directory and verify the whole build

The generated artwork is **kept, not deleted** — it is wanted later as sample
material for exercising uploads, cropping and sizing. It moves out of
`src/assets/` so nothing can import it and it can never re-enter the bundle,
but it stays tracked in git and available on every machine.

**There is nothing to clean off the server or R2.** These files are build-time
`import` statements bundled by Vite, not uploads — they never passed through
the upload pipeline, so they have no `images` row and no R2 object. Verified
against the dev database: `images` has 0 rows, and no user or story references
an image. The app R2 buckets are not provisioned yet.

**Files:**
- Move: five profile covers (`.webp` + `.png`) from `src/assets/story-card-backgrounds/` to `fixtures/sample-images/profile-covers/`
- Move: `src/assets/app-backgrounds/landing-minimal-sky.{png,webp}` to `fixtures/sample-images/backgrounds/`
- Modify: `scripts/optimizeAssets.ts:38-49`, `scripts/optimizedAssets.json`
- Test: `src/repositoryHygiene.test.ts`

**Interfaces:**
- Consumes: Task 6 removed the last import of the profile covers; Task 3 removed the last reference to `landing-minimal-sky`.
- Produces: nothing.

- [ ] **Step 1: Write the failing test**

Add to `src/repositoryHygiene.test.ts`:

```ts
  it("keeps retired artwork out of the bundle but on disk as fixtures", () => {
    // [fixture path, the src/assets path it must no longer occupy]
    const retired: [string, string][] = [
      ["profile-covers/motel-lobby", "story-card-backgrounds/motel-lobby"],
      ["profile-covers/neon-sleepover", "story-card-backgrounds/neon-sleepover"],
      ["profile-covers/orbit-threads", "story-card-backgrounds/orbit-threads"],
      ["profile-covers/phil-stories", "story-card-backgrounds/phil-stories"],
      ["profile-covers/void-pop", "story-card-backgrounds/void-pop"],
      ["backgrounds/landing-minimal-sky", "app-backgrounds/landing-minimal-sky"]
    ];

    for (const [fixturePath, assetPath] of retired) {
      // Kept for upload/sizing fixtures, so both formats must still exist ...
      expect(existsSync(`fixtures/sample-images/${fixturePath}.png`)).toBe(true);
      expect(existsSync(`fixtures/sample-images/${fixturePath}.webp`)).toBe(true);
      // ... but never from a path Vite can bundle.
      expect(existsSync(`src/assets/${assetPath}.png`)).toBe(false);
      expect(existsSync(`src/assets/${assetPath}.webp`)).toBe(false);
    }

    const landing = readFileSync("src/components/LandingPage.tsx", "utf8");
    const css = readFileSync("src/index.css", "utf8");

    expect(landing).not.toContain("story-card-backgrounds/motel-lobby");
    expect(css).not.toContain("landing-minimal-sky");
    // Story cover art and the story-route background are out of scope, and
    // must survive this cleanup.
    expect(landing).toContain("story-covers/");
    expect(existsSync("src/assets/coffee-shop-background.webp")).toBe(true);
  });
```

The old and new paths are paired explicitly because the two groups live in
different source directories — deriving the `src/assets` path from the fixture
path makes the `landing-minimal-sky` assertion check a location that never
existed, so it would pass without proving anything.

The last two assertions are the guards that matter: the two files under
`story-covers/` and the coffee-shop background are still in use.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/repositoryHygiene.test.ts`
Expected: FAIL — the fixtures directory does not exist yet.

- [ ] **Step 3: Confirm nothing imports them, then move**

```bash
grep -rn "motel-lobby\|neon-sleepover\|orbit-threads\|phil-stories\|void-pop\|landing-minimal-sky" src/ scripts/
```

Expected: matches only in `scripts/optimizedAssets.json` and `scripts/optimizeAssets.ts`. If `LandingPage.tsx` or `index.css` still appears, Task 6 or Task 3 is incomplete — stop and finish it first.

```bash
mkdir -p fixtures/sample-images/profile-covers fixtures/sample-images/backgrounds

git mv src/assets/story-card-backgrounds/motel-lobby.png    fixtures/sample-images/profile-covers/
git mv src/assets/story-card-backgrounds/motel-lobby.webp   fixtures/sample-images/profile-covers/
git mv src/assets/story-card-backgrounds/neon-sleepover.png  fixtures/sample-images/profile-covers/
git mv src/assets/story-card-backgrounds/neon-sleepover.webp fixtures/sample-images/profile-covers/
git mv src/assets/story-card-backgrounds/orbit-threads.png   fixtures/sample-images/profile-covers/
git mv src/assets/story-card-backgrounds/orbit-threads.webp  fixtures/sample-images/profile-covers/
git mv src/assets/story-card-backgrounds/phil-stories.png    fixtures/sample-images/profile-covers/
git mv src/assets/story-card-backgrounds/phil-stories.webp   fixtures/sample-images/profile-covers/
git mv src/assets/story-card-backgrounds/void-pop.png        fixtures/sample-images/profile-covers/
git mv src/assets/story-card-backgrounds/void-pop.webp       fixtures/sample-images/profile-covers/
git mv src/assets/app-backgrounds/landing-minimal-sky.png    fixtures/sample-images/backgrounds/
git mv src/assets/app-backgrounds/landing-minimal-sky.webp   fixtures/sample-images/backgrounds/
```

The PNGs are 2–3 MB multi-megapixel originals and the WebPs are 40–180 KB
downscales — deliberately keep both, since a large original and a small
optimized file exercise different paths in the upload and resize pipeline.

- [ ] **Step 4: Write the fixtures README**

Create `fixtures/sample-images/README.md`:

```markdown
# Sample images

Generated artwork retired from the app on 2026-07-27 when profile cards moved
to code-drawn art. Kept deliberately as test material for the upload pipeline —
cropping, resizing, rendition selection, rejection paths.

- `profile-covers/` — five 2–3 MB PNG originals with 40–180 KB WebP downscales.
- `backgrounds/` — the retired landing background, same pairing.

Nothing here is imported by the app. Do not import from `fixtures/`; anything
the app actually ships belongs in `src/assets/`.
```

- [ ] **Step 5: Update the asset optimizer**

In `scripts/optimizeAssets.ts`, delete these two lines from `TARGETS`:

```ts
  { path: "app-backgrounds/landing-minimal-sky.png", maxWidth: 1920, quality: 78 },
```

```ts
  { path: "story-card-backgrounds", maxWidth: 640, quality: 78 },
```

`collectSources` does not recurse, so the `story-card-backgrounds` entry covered
only the five files just moved and would now resolve to an empty set. The
separate `story-card-backgrounds/story-covers` entry is unaffected and stays.

Then remove these six keys from `scripts/optimizedAssets.json`:

```
app-backgrounds/landing-minimal-sky.webp
story-card-backgrounds/motel-lobby.webp
story-card-backgrounds/neon-sleepover.webp
story-card-backgrounds/orbit-threads.webp
story-card-backgrounds/phil-stories.webp
story-card-backgrounds/void-pop.webp
```

Leaving stale ledger keys behind is harmless at runtime but makes
`npm run assets:optimize` report skips for files that no longer exist.

- [ ] **Step 6: Verify the optimizer still runs**

Run: `npm run assets:optimize`
Expected: completes without error, touching only the remaining targets. No entry for a moved file.

- [ ] **Step 7: Run the full suite and build**

Run: `npm run dev:db && npm test && npm run build`
Expected: all tests PASS, build succeeds.

Then confirm the retired art is genuinely out of the bundle:

```bash
ls dist/assets | grep -E "motel-lobby|neon-sleepover|orbit-threads|phil-stories|void-pop|landing-minimal-sky" || echo "PASS: retired art is not in the bundle"
```

Expected: `PASS`. Anything listed means a live import survived.

- [ ] **Step 8: Browser-check both viewports**

Start the dev server and check `http://127.0.0.1:5174/` at 1280×720 and 390×844. Confirm:
- handles render with no `'s stories` anywhere
- bios appear on cards and rows
- search sits between deck and list and still filters
- the account panel opens directly under its trigger
- the mobile bottom nav does not cover the end of the list
- body text stays legible over the neon
- the browser console has no errors or warnings

Then open a story and confirm the coffee-shop background still paints behind
the phone — that is the regression Task 3 is most likely to have introduced.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore: retire orphaned artwork to fixtures"
```

---

## Self-Review

**Spec coverage.** Theme tokens → Task 3. Background → Task 4. Profile art → Task 5. Handle-only → Tasks 2, 6, 7. Bio → Tasks 1, 2, 6. Demo accounts → Task 2. Search relocation → Task 6. Account panel → Task 7. Asset retirement → Task 8. Credentials are documentation-only in the spec and need no task.

**Amendment (2026-07-27).** The spec says to delete the profile cover artwork.
Superseded on request: it is moved to `fixtures/sample-images/` instead, to be
reused as upload and sizing test material. Nothing needs removing from the
server or R2 — these were bundled imports, never uploads, and the `images`
table is empty.

**Regression risk to watch.** Task 3 rewrites `src/index.css` around the
`.app-background` rules. `.app-background--story` must survive: it paints the
coffee-shop treatment behind the phone player, which is out of scope for this
change. An early draft of this plan deleted it along with `--landing`. Task 8
step 8 checks for it explicitly.

**Deliberately deferred, per the spec's follow-up list:** dropping the `display_name` column, letting an account claim a seeded profile, and theming the phone player.

**Known breakages this plan handles explicitly:** `indexCss.test.ts` asserts on `landing-minimal-sky.webp` (rewritten in Task 3); `App.test.tsx` fixtures assert on `phil's stories` (updated in Task 6); `platformSeed.test.ts` asserts on the old usernames (rewritten in Task 2).
