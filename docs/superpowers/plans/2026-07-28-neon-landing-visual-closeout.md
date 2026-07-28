# Neon Landing Visual Closeout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the two defects found during the first composited visual review of the neon landing branch, then leave a verified local preview running.

**Architecture:** Keep the existing neon/profile implementation intact. Constrain the browsing page's single CSS grid track so intrinsic child width cannot exceed the mobile content box, and centralize forward-navigation scroll reset in `useAppRoute` so profile and story routes start at the top while `popstate` retains native browser restoration.

**Tech Stack:** React 19, TypeScript 6, Tailwind 4, Vitest, Testing Library, Vite, PostgreSQL 16.

## Global Constraints

- Do not change the neon palette, generated artwork, deck mechanics, or phone/editor styling.
- Keep the card transition's explicit `transform`, `opacity`, and `filter` property list.
- Browser-check at 390×844 and 1280×720, plus horizontal clipping at 375px.
- Use test-first red/green cycles for each production change.
- Leave `npm run dev -- --port 5174` running for user review.

---

### Task 1: Constrain the mobile browsing grid

**Files:**
- Modify: `src/App.test.tsx`
- Modify: `src/components/LandingPage.tsx:457`

**Interfaces:**
- Consumes: the existing root browsing `<section>` rendered by `LandingPage`.
- Produces: one explicit `minmax(0, 1fr)` grid track through Tailwind's `grid-cols-1` utility.

- [x] **Step 1: Write the failing regression test**

Add this assertion to the existing test `"starts in a persistent browsing shell with a featured deck and profile list"` after locating the `chatsim` heading:

```tsx
const browseGrid = screen.getByRole("heading", { name: "chatsim" }).closest("section");

expect(browseGrid).toHaveClass("grid-cols-1");
```

This catches the production regression where the implicit `auto` track grows wider than the mobile content box.

- [x] **Step 2: Run the focused test and verify RED**

Run:

```bash
npx vitest run src/App.test.tsx -t "starts in a persistent browsing shell"
```

Expected: FAIL because the section does not contain `grid-cols-1`.

- [x] **Step 3: Implement the minimal grid constraint**

Change the root browsing section to:

```tsx
<section className="mx-auto grid w-full grid-cols-1 max-w-5xl gap-8 pb-24">
```

- [x] **Step 4: Run the focused test and verify GREEN**

Run the Step 2 command again.

Expected: PASS with no console warnings or errors.

---

### Task 2: Reset forward route navigation to the top

**Files:**
- Create: `src/navigation/appRouteHook.test.tsx`
- Modify: `src/navigation/appRoute.ts:131-143`

**Interfaces:**
- Consumes: `useAppRoute().navigate(nextRoute)` and the browser's `window.scrollTo`.
- Produces: forward `navigate`/`replace` route changes scroll to `{ left: 0, top: 0 }`; `popstate` remains untouched.

- [x] **Step 1: Write the failing hook regression test**

Create a small real hook harness that renders the current route and a button calling:

```tsx
navigate({ name: "profile", profileId: "user-phil" });
```

Stub `window.scrollTo` with a browser-faithful test implementation that updates a local `scrollY` value. Start at `scrollY = 240`, click the button, and assert:

```tsx
expect(window.location.pathname).toBe("/profiles/user-phil");
expect(scrollY).toBe(0);
```

Add a second test that dispatches `popstate` after changing history and asserts the existing scroll value is preserved.

- [x] **Step 2: Run the new test and verify RED**

Run:

```bash
npx vitest run src/navigation/appRouteHook.test.tsx
```

Expected: the forward-navigation test FAILS with scroll remaining at `240`; the `popstate` preservation test passes.

- [x] **Step 3: Implement the minimal scroll reset**

Inside `commitRoute`, after a changed path is pushed or replaced and before `setRoute(nextRoute)`, call:

```ts
window.scrollTo({ left: 0, top: 0 });
```

Do not add scroll calls to `handlePopState`.

- [x] **Step 4: Run the new test and verify GREEN**

Run the Step 2 command again.

Expected: both tests PASS.

---

### Task 3: Verify, document, and hand off the local preview

**Files:**
- Modify: `docs/superpowers/specs/2026-07-27-landing-neon-theme-and-identity-design.md`
- Verify: all changed source and tests

**Interfaces:**
- Consumes: Tasks 1 and 2.
- Produces: a clean committed feature branch and a running local preview at `http://127.0.0.1:5174/`.

- [x] **Step 1: Confirm the bio UI follow-up**

Keep the already-added follow-up stating that the API accepts `bio` but no owner/account UI exposes it.

- [x] **Step 2: Run full automated verification**

Run:

```bash
npm run dev:db
npm test
npx tsc -b
npm run build
```

Expected: all tests pass, type-check is clean, and the production build succeeds.

- [x] **Step 3: Browser-check the real render**

At 1280×720 and 390×844 confirm:

- no right-edge clipping on search or profile rows;
- selecting a profile starts with its heading visible at the top;
- focus rings remain `#ff2d78`;
- one Account trigger remains;
- story route has the coffee-shop background and no `.neon-bg`;
- console has no warnings or errors.

At 375px confirm document width equals viewport width and all glass-panel right edges remain within the content box.

- [x] **Step 4: Commit the closeout**

```bash
git add docs/superpowers/specs/2026-07-27-landing-neon-theme-and-identity-design.md docs/superpowers/plans/2026-07-28-neon-landing-visual-closeout.md src/App.test.tsx src/components/LandingPage.tsx src/navigation/appRoute.ts src/navigation/appRouteHook.test.tsx
git commit -m "fix: close neon landing visual regressions"
```

- [x] **Step 5: Leave the preview running**

Run:

```bash
npm run dev -- --port 5174
```

Verify `http://127.0.0.1:5174/` responds before handing back to the user.

## Self-Review

- Spec coverage: the plan addresses both defects observed in the visual review and preserves every original theme/profile constraint.
- Placeholder scan: no TBD/TODO or unspecified implementation steps remain.
- Type consistency: `navigate`, `replace`, `AppRoute`, and `window.scrollTo` use their existing browser/TypeScript interfaces.
