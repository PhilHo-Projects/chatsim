# Lightweight Edge Tendrils Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dense blurred neon field with quiet animated edge tendrils and remove the browsing-route paint/compositing traps that make scrolling and deck movement stutter.

**Architecture:** Keep React and ordinary SVG/CSS. `NeonBackground` becomes two hand-authored edge SVG layers plus eight compositor-friendly sparks; the DOM remains responsible for all interactive UI. Deck movement, profile art, shell surfaces, and overflow are simplified so the browsing route uses no CSS/SVG blur or backdrop filtering.

**Tech Stack:** React 19, TypeScript 6, Tailwind CSS 4, inline SVG, Vitest, Testing Library, Vite.

## Global Constraints

- Page base remains `#050507`.
- Render exactly ten tendril paths, five per side, and exactly eight sparks.
- Keep the middle 60% of the viewport visually clear.
- Use no more than 10 continuous animations in normal motion mode.
- Animate only `transform` and `opacity`.
- Use no CSS `filter`, `backdrop-filter`, SVG `<filter>`, `mix-blend-mode`, path-level animation, Canvas, WebGL, or JavaScript animation loop on the browsing route.
- Keep the existing deck mechanics, keyboard controls, autoplay, pause rules, routing, search, account behaviour, phone player, and script editors.
- Under `prefers-reduced-motion: reduce`, edge drift and spark pulses stop.
- At 375px, the page has no horizontal overflow.

## File Map

- `src/components/NeonBackground.tsx`: owns the explicit tendril and spark geometry and emits inert decorative markup.
- `src/components/NeonBackground.test.tsx`: enforces density and filter/animation structure.
- `src/index.css`: owns edge placement, compositor-only motion, opaque browsing surfaces, and reduced-motion behaviour.
- `src/indexCss.test.ts`: enforces the CSS performance budget.
- `src/components/LandingPage.tsx`: renders filter-free generated profile art and compositor-only deck card movement.
- `src/App.test.tsx`: covers rendered profile art, deck styles, and shell classes through the real application.
- `src/components/AppShell.tsx`: restores sticky scrolling and removes live backdrop blur classes.

---

### Task 1: Replace the Full-Field Neon Renderer

**Files:**
- Modify: `src/components/NeonBackground.tsx`
- Modify: `src/components/NeonBackground.test.tsx`
- Modify: `src/index.css:156-233`
- Modify: `src/indexCss.test.ts`

**Interfaces:**
- Consumes: existing CSS tokens `--neon-1` through `--neon-4` and new decorative token `--neon-warm`.
- Produces: `NeonBackground(): JSX.Element`, `.neon-bg__edge--left`, `.neon-bg__edge--right`, and `.neon-bg__spark`.

- [ ] **Step 1: Replace the geometry tests with failing rendered-structure tests**

Replace `src/components/NeonBackground.test.tsx` with:

```tsx
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NeonBackground } from "./NeonBackground";

describe("lightweight neon background", () => {
  it("renders five hairline tendrils on each edge and eight sparks", () => {
    const { container } = render(<NeonBackground />);

    expect(container.querySelectorAll(".neon-bg__edge--left path")).toHaveLength(5);
    expect(container.querySelectorAll(".neon-bg__edge--right path")).toHaveLength(5);
    expect(container.querySelectorAll(".neon-bg__spark")).toHaveLength(8);
  });

  it("keeps animation off path geometry and uses no SVG filters", () => {
    const { container } = render(<NeonBackground />);

    expect(container.querySelector("filter, feGaussianBlur")).toBeNull();

    for (const path of container.querySelectorAll(".neon-bg path")) {
      expect(path).not.toHaveAttribute("style");
      expect(path).not.toHaveAttribute("stroke-dasharray");
      expect(path).toHaveAttribute("vector-effect", "non-scaling-stroke");
    }
  });
});
```

Extend `src/indexCss.test.ts` with:

```ts
it("keeps the edge background filter-free and compositor-only", () => {
  const css = readFileSync("src/index.css", "utf8");
  const neonCss = css.slice(css.indexOf("/* --- Lightweight edge tendrils --- */"));

  expect(neonCss).not.toContain("filter:");
  expect(neonCss).not.toContain("backdrop-filter");
  expect(neonCss).not.toContain("mix-blend-mode");
  expect(neonCss).not.toContain("stroke-dashoffset");
  expect(neonCss).not.toContain("neon-flow");
  expect(neonCss).toContain("@keyframes neon-edge-drift-left");
  expect(neonCss).toContain("@keyframes neon-edge-drift-right");
  expect(neonCss).toContain("@keyframes neon-spark-breathe");
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```powershell
npm test -- src/components/NeonBackground.test.tsx src/indexCss.test.ts
```

Expected: FAIL because the current component renders 44 paths, zero
`.neon-bg__spark` elements, animated path styles, blurred layers, blend modes,
and the old `neon-flow` keyframes.

- [ ] **Step 3: Replace procedural geometry with explicit edge geometry**

Replace `src/components/NeonBackground.tsx` with:

```tsx
type Tendril = {
  color: string;
  d: string;
  opacity: number;
  width: number;
};

type Spark = {
  color: string;
  delay: string;
  duration: string;
  id: string;
  left?: string;
  right?: string;
  size: number;
  top: string;
};

const LEFT_TENDRILS: readonly Tendril[] = [
  {
    color: "var(--neon-4)",
    d: "M-18 34 C92 12 158 96 118 214 S20 358 86 498 S212 690 18 858",
    opacity: 0.34,
    width: 0.72
  },
  {
    color: "var(--neon-3)",
    d: "M42-36 C166 108 34 214 104 344 S258 482 108 624 S32 804 194 938",
    opacity: 0.28,
    width: 0.58
  },
  {
    color: "var(--neon-1)",
    d: "M-58 168 C82 132 246 172 190 304 S24 442 136 584 S250 712 68 924",
    opacity: 0.24,
    width: 0.5
  },
  {
    color: "var(--neon-warm)",
    d: "M-6 426 C112 362 224 394 166 512 S18 650 106 762 S222 862 246 934",
    opacity: 0.38,
    width: 0.82
  },
  {
    color: "var(--neon-2)",
    d: "M184-30 C72 82 264 170 172 302 S94 472 246 562 S286 760 144 928",
    opacity: 0.22,
    width: 0.46
  }
];

const RIGHT_TENDRILS: readonly Tendril[] = [
  {
    color: "var(--neon-3)",
    d: "M378 24 C230 88 188 164 250 266 S382 408 266 522 S160 704 346 904",
    opacity: 0.34,
    width: 0.74
  },
  {
    color: "var(--neon-4)",
    d: "M314-34 C202 102 332 216 252 330 S102 476 238 598 S326 792 174 936",
    opacity: 0.28,
    width: 0.54
  },
  {
    color: "var(--neon-warm)",
    d: "M414 188 C276 130 112 180 174 316 S340 446 226 592 S108 734 286 926",
    opacity: 0.4,
    width: 0.88
  },
  {
    color: "var(--neon-1)",
    d: "M368 420 C252 360 136 402 198 520 S340 654 244 758 S116 858 88 936",
    opacity: 0.24,
    width: 0.5
  },
  {
    color: "var(--neon-2)",
    d: "M172-26 C286 84 92 176 190 304 S270 474 114 566 S70 756 214 930",
    opacity: 0.22,
    width: 0.46
  }
];

const SPARKS: readonly Spark[] = [
  { color: "var(--neon-warm)", delay: "-1.2s", duration: "7.4s", id: "spark-1", left: "5%", size: 4, top: "13%" },
  { color: "var(--neon-3)", delay: "-4.6s", duration: "9.2s", id: "spark-2", left: "14%", size: 3, top: "31%" },
  { color: "var(--neon-4)", delay: "-2.8s", duration: "6.8s", id: "spark-3", left: "7%", size: 5, top: "68%" },
  { color: "var(--neon-1)", delay: "-6.1s", duration: "10.6s", id: "spark-4", left: "17%", size: 2, top: "86%" },
  { color: "var(--neon-3)", delay: "-3.7s", duration: "8.8s", id: "spark-5", right: "6%", size: 4, top: "17%" },
  { color: "var(--neon-warm)", delay: "-5.2s", duration: "10.2s", id: "spark-6", right: "15%", size: 3, top: "43%" },
  { color: "var(--neon-4)", delay: "-1.9s", duration: "7.8s", id: "spark-7", right: "8%", size: 5, top: "69%" },
  { color: "var(--neon-1)", delay: "-7.1s", duration: "11s", id: "spark-8", right: "18%", size: 3, top: "87%" }
];

function EdgeTendrils({
  className,
  tendrils
}: {
  className: string;
  tendrils: readonly Tendril[];
}) {
  return (
    <svg
      className={`neon-bg__edge ${className}`}
      preserveAspectRatio="none"
      viewBox="0 0 360 900"
    >
      {tendrils.map((tendril, index) => (
        <path
          key={`${className}-${index}`}
          d={tendril.d}
          fill="none"
          opacity={tendril.opacity}
          stroke={tendril.color}
          strokeLinecap="round"
          strokeWidth={tendril.width}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
}

export function NeonBackground() {
  return (
    <div aria-hidden="true" className="neon-bg">
      <EdgeTendrils className="neon-bg__edge--left" tendrils={LEFT_TENDRILS} />
      <EdgeTendrils className="neon-bg__edge--right" tendrils={RIGHT_TENDRILS} />
      {SPARKS.map((spark) => (
        <span
          key={spark.id}
          className="neon-bg__spark"
          style={{
            animationDelay: spark.delay,
            animationDuration: spark.duration,
            backgroundColor: spark.color,
            height: spark.size,
            left: spark.left,
            right: spark.right,
            top: spark.top,
            width: spark.size
          }}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Replace the old neon CSS with the lightweight edge CSS**

Add `--neon-warm: #f2a766;` after `--neon-4` in `:root`.

Replace the existing neon block at the end of `src/index.css` with:

```css
/* --- Lightweight edge tendrils --- */
.neon-bg {
  position: fixed;
  inset: 0;
  z-index: 0;
  overflow: clip;
  pointer-events: none;
}

.neon-bg__edge {
  position: absolute;
  top: -2%;
  display: block;
  width: clamp(5.5rem, 24vw, 22rem);
  height: 104%;
  transform-origin: center;
  will-change: transform;
}

.neon-bg__edge--left {
  left: 0;
  animation: neon-edge-drift-left 34s ease-in-out infinite alternate;
}

.neon-bg__edge--right {
  right: 0;
  animation: neon-edge-drift-right 41s ease-in-out infinite alternate;
}

.neon-bg__spark {
  position: absolute;
  display: block;
  border-radius: 999px;
  opacity: 0.18;
  animation-name: neon-spark-breathe;
  animation-timing-function: ease-in-out;
  animation-iteration-count: infinite;
}

@keyframes neon-edge-drift-left {
  from { transform: translate3d(-1.2%, -0.8%, 0) scale(1.01) rotate(-0.25deg); }
  to { transform: translate3d(1.4%, 0.9%, 0) scale(1.025) rotate(0.45deg); }
}

@keyframes neon-edge-drift-right {
  from { transform: translate3d(1.1%, -0.7%, 0) scale(1.02) rotate(0.35deg); }
  to { transform: translate3d(-1.3%, 0.8%, 0) scale(1.01) rotate(-0.4deg); }
}

@keyframes neon-spark-breathe {
  0%, 100% {
    opacity: 0.12;
    transform: scale(0.78);
  }
  50% {
    opacity: 0.82;
    transform: scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .neon-bg__edge,
  .neon-bg__spark {
    animation: none !important;
  }
}
```

- [ ] **Step 5: Run the focused tests and verify GREEN**

Run:

```powershell
npm test -- src/components/NeonBackground.test.tsx src/indexCss.test.ts
```

Expected: both files PASS. Confirm `src/index.css` contains none of
`.neon-bg__blooms`, `.neon-bg__glow`, `.neon-bg__core`, `neon-flow`,
`stroke-dashoffset`, `mix-blend-mode`, or a neon-block filter.

- [ ] **Step 6: Commit the lightweight renderer**

```powershell
git add -- src/components/NeonBackground.tsx src/components/NeonBackground.test.tsx src/index.css src/indexCss.test.ts
git commit -m "feat: replace neon field with edge tendrils"
```

---

### Task 2: Make Profile Art and Deck Movement Filter-Free

**Files:**
- Modify: `src/components/LandingPage.tsx:3,50-108,147-173,287-299`
- Modify: `src/App.test.tsx:704-737,948-958`

**Interfaces:**
- Consumes: existing `buildProfileArt(handle, { compact })` output.
- Produces: unchanged `ProfileArtwork` markup contract and featured-deck interaction, with no SVG or CSS filters.

- [ ] **Step 1: Write failing tests for filter-free profile art and deck cards**

Replace the blur-specific assertions in
`"cycles the featured deck and keeps logged-out browsing open"` with:

```tsx
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
```

Replace `"does not repeat SVG filter ids across ProfileArtwork instances"` with:

```tsx
it("renders generated profile art without SVG filters", async () => {
  mockSession = null;
  const { container } = render(<App />);
  await flushPlatformEffects();

  expect(container.querySelector("filter, feGaussianBlur")).toBeNull();
  expect(container.querySelectorAll(".profile-art__depth path").length).toBeGreaterThan(1);
});
```

- [ ] **Step 2: Run the app test and verify RED**

Run:

```powershell
npm test -- src/App.test.tsx
```

Expected: FAIL because neighboring deck cards still have `filter: blur(...)`,
the transition still includes `filter`, and generated artwork still renders
`filter`/`feGaussianBlur`.

- [ ] **Step 3: Remove SVG Gaussian blur from `ProfileArtwork`**

In `src/components/LandingPage.tsx`:

- remove `useId` from the React import;
- remove `const filterId = useId();`;
- change the depth group to:

```tsx
<g className="profile-art__depth">
  {art.strokes.map((stroke, index) => (
    <path
      key={`depth-${index}`}
      d={stroke.d}
      fill="none"
      opacity={stroke.opacity * 0.18}
      stroke={stroke.color}
      strokeLinecap="round"
      strokeWidth={stroke.width * (compact ? 1.5 : 2.4)}
    />
  ))}
</g>
```

- retain the existing core-stroke and node loops; and
- delete the entire `<defs><filter><feGaussianBlur /></filter></defs>` block.

- [ ] **Step 4: Remove CSS blur from deck placement and transitions**

In `getDeckCardStyle`:

- delete the `blur` local;
- delete the returned `filter` property; and
- keep opacity, transform, pointer-events, and z-index unchanged.

Replace the transition comment and value with:

```tsx
// Width is intentionally excluded so viewport changes cannot animate the
// measured card size. Transform and opacity remain compositor-friendly.
transition: prefersReducedMotion
  ? "none"
  : "transform 500ms ease-out, opacity 500ms ease-out"
```

- [ ] **Step 5: Run the focused app test and verify GREEN**

Run:

```powershell
npm test -- src/App.test.tsx
```

Expected: PASS with no rendered `filter` or `feGaussianBlur`, while deck
advancement and profile opening still pass.

- [ ] **Step 6: Commit the filter-free deck**

```powershell
git add -- src/components/LandingPage.tsx src/App.test.tsx
git commit -m "perf: make profile deck compositor-only"
```

---

### Task 3: Remove Live Glass Blur and Restore Sticky Scrolling

**Files:**
- Modify: `src/components/AppShell.tsx:33-38,42-44,76,121-123`
- Modify: `src/App.test.tsx:357-380`
- Modify: `src/index.css:11-18,52-58`
- Modify: `src/indexCss.test.ts`

**Interfaces:**
- Consumes: existing `--surface`, `--line`, and shell navigation structure.
- Produces: the same `AppShell` public props and navigation behaviour, with an actually sticky top bar and no browsing-route backdrop blur.

- [ ] **Step 1: Write failing shell and CSS tests**

After the existing `appShell` assertions in the first `App` test, add:

```tsx
expect(appShell).toHaveClass("overflow-x-clip");
expect(appShell).not.toHaveClass("overflow-hidden");

const desktopNav = screen.getByRole("navigation", { name: "Desktop navigation" });
const mobileNav = screen.getByRole("navigation", { name: "Mobile navigation" });
const topBar = appShell?.querySelector(".sticky.top-0");

expect(desktopNav).not.toHaveClass("backdrop-blur-xl");
expect(mobileNav).not.toHaveClass("backdrop-blur-xl");
expect(topBar).not.toBeNull();
expect(topBar).not.toHaveClass("backdrop-blur-xl");
```

Extend `src/indexCss.test.ts` with:

```ts
it("uses opaque browsing surfaces without live backdrop blur", () => {
  const css = readFileSync("src/index.css", "utf8");
  const appGlass = css.match(/\.app-glass\s*\{([^}]*)\}/)?.[1] ?? "";

  expect(css).toContain("--surface: rgba(10, 9, 13, 0.92)");
  expect(css).not.toContain("backdrop-filter");
  expect(appGlass).toContain("background: var(--surface)");
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```powershell
npm test -- src/App.test.tsx src/indexCss.test.ts
```

Expected: FAIL because the shell still uses `overflow-hidden` and three
`backdrop-blur-xl` classes, `--surface` is still `0.62`, and `.app-glass`
still declares `backdrop-filter`.

- [ ] **Step 3: Make browsing surfaces opaque and filter-free**

In `src/index.css`:

- change `--surface: rgba(10, 9, 13, 0.62);` to
  `--surface: rgba(10, 9, 13, 0.92);`;
- replace the obsolete 22-tendril glass comment with
  `/* Opaque enough for text without a live backdrop blur. */`; and
- delete `backdrop-filter: blur(20px) saturate(1.1);` from `.app-glass`.

- [ ] **Step 4: Restore sticky layout and remove Tailwind backdrop blur**

In `src/components/AppShell.tsx`:

- replace the root `overflow-hidden` class with `overflow-x-clip`;
- remove `backdrop-blur-xl` from the desktop navigation;
- remove `backdrop-blur-xl` from the sticky top bar; and
- remove `backdrop-blur-xl` from the mobile navigation.

Do not change the story background’s `filter: blur(5px) saturate(1.08)`;
that filter belongs to the out-of-scope phone route and does not animate.

- [ ] **Step 5: Run the focused tests and verify GREEN**

Run:

```powershell
npm test -- src/App.test.tsx src/indexCss.test.ts
```

Expected: PASS. `AppShell` behaviour is unchanged, its root has
`overflow-x-clip`, and `src/index.css` has no `backdrop-filter`.

- [ ] **Step 6: Commit the shell performance fix**

```powershell
git add -- src/components/AppShell.tsx src/App.test.tsx src/index.css src/indexCss.test.ts
git commit -m "fix: remove glass blur and restore sticky shell"
```

---

### Task 4: Full Verification and Visual Tuning

**Files:**
- Verify: all changed source and test files
- Modify only if live inspection finds a concrete visual defect: `src/components/NeonBackground.tsx`, `src/index.css`

**Interfaces:**
- Consumes: the completed filter-free browsing route.
- Produces: verified desktop/mobile visuals and evidence that the structural performance budget is met.

- [ ] **Step 1: Run the complete automated suite**

Run:

```powershell
npm run dev:db
npm test
npx tsc -b
npm run build
```

Expected: all tests pass, TypeScript exits 0, and Vite production build exits 0.

- [ ] **Step 2: Start or reuse the local preview**

Run:

```powershell
npm run dev -- --port 5174
```

Open `http://127.0.0.1:5174/`.

- [ ] **Step 3: Verify the live performance structure**

At the browse route, inspect the rendered page and confirm:

```js
({
  tendrils: document.querySelectorAll(".neon-bg__edge path").length,
  sparks: document.querySelectorAll(".neon-bg__spark").length,
  animated: [...document.querySelectorAll("*")].filter(
    (element) => getComputedStyle(element).animationName !== "none"
  ).length,
  cssFilters: [...document.querySelectorAll("*")].filter(
    (element) => getComputedStyle(element).filter !== "none"
  ).length,
  backdropFilters: [...document.querySelectorAll("*")].filter(
    (element) => getComputedStyle(element).backdropFilter !== "none"
  ).length,
  svgFilters: document.querySelectorAll("filter, feGaussianBlur").length
})
```

Expected:

```js
{
  tendrils: 10,
  sparks: 8,
  animated: 10,
  cssFilters: 0,
  backdropFilters: 0,
  svgFilters: 0
}
```

- [ ] **Step 4: Browser-check desktop at 1280×720**

Confirm:

- the base reads near-black, not blue-grey or purple;
- curves occupy the corner/side bands and leave the central content area calm;
- paths are hairline-thin and dim;
- the two edge clusters float slowly without travelling dash highlights;
- eight tiny coloured sparks pulse independently;
- deck autoplay moves cards without blur interpolation;
- wheel scrolling remains visually smooth;
- the top bar remains at viewport `y = 0` after scrolling; and
- keyboard focus remains visibly pink on deck controls, search, and profile rows.

- [ ] **Step 5: Browser-check mobile at 390×844 and overflow at 375px**

Confirm:

- edge tendrils do not form a bright band behind body text;
- the center remains visually clear;
- bottom navigation does not cover the last profile row;
- `document.documentElement.scrollWidth <= window.innerWidth` at 375px;
- the top bar remains sticky while scrolling; and
- the console contains no errors or warnings.

- [ ] **Step 6: Verify reduced motion**

Emulate `prefers-reduced-motion: reduce` and confirm computed
`animation-name: none` on both `.neon-bg__edge` elements and all
`.neon-bg__spark` elements while the static artwork remains visible.

- [ ] **Step 7: Make only evidence-driven visual adjustments**

If the browser check finds the edge field too bright, too central, or too busy,
change only tendril coordinates/opacities, spark positions/sizes, or the edge
width/duration values already covered by Tasks 1–3. Do not add filters, blend
modes, path animation, more paths, more sparks, or new animation properties.

After each adjustment, rerun:

```powershell
npm test -- src/components/NeonBackground.test.tsx src/indexCss.test.ts src/App.test.tsx
```

- [ ] **Step 8: Re-run final verification and commit any visual tuning**

Run:

```powershell
npm test
npx tsc -b
npm run build
git diff --check
git status --short
```

If Step 7 changed files:

```powershell
git add -- src/components/NeonBackground.tsx src/index.css
git commit -m "style: tune lightweight edge tendrils"
```

Expected: complete suite green, build clean, no whitespace errors, and no
uncommitted implementation changes.
