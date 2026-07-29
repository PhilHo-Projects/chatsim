# Tendril Seaweed Sway Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing landing-page tendrils visibly sway toward the center like slow underwater seaweed.

**Architecture:** Keep the existing `NeonBackground` React structure, six SVG layers, ten static paths, and eight sparks. Change only the feature-owned neon stylesheet and its contract test: use asymmetric transform-only keyframes, lower outer-edge transform origins, negative phase offsets, and smaller custom-property travel values on narrow screens.

**Tech Stack:** React 19, TypeScript, CSS animations, Vitest, Testing Library, Vite.

## Global Constraints

- Do not add WebGL, canvas, JavaScript animation loops, SVG geometry, dependencies, or another background component.
- Animate only `transform` and spark `opacity`.
- Do not add filters, backdrop filters, blend modes, stroke-dash animation, or SVG path morphing.
- Keep all six SVG edge layers, ten static paths, and eight sparks.
- Keep `/motion-lab` rendering the same `NeonBackground` module as the landing page.
- `prefers-reduced-motion: reduce` must disable decorative motion.
- The landing page must have no horizontal overflow at 375 CSS pixels.

---

### Task 1: Tune the six tendril layers

**Files:**
- Modify: `src/indexCss.test.ts`
- Modify: `src/animations/neon-background/neon-background.css`

**Interfaces:**
- Consumes: the existing `.neon-bg__edge--{left,right}-{near,mid,far}` classes and six `neon-edge-*` keyframe names.
- Produces: the same CSS class and keyframe interface with perceptible seaweed-style timing and travel.

- [ ] **Step 1: Write the failing seaweed-motion contract test**

Add this test to `src/indexCss.test.ts`:

```ts
it("gives the edge layers a perceptible lower-anchored seaweed sway", () => {
  const neonCss = readFileSync(
    "src/animations/neon-background/neon-background.css",
    "utf8"
  );

  expect(neonCss).toContain("--neon-left-near-inward: 32px");
  expect(neonCss).toContain("--neon-right-near-inward: -32px");
  expect(neonCss).toContain("--neon-left-near-inward: 18px");
  expect(neonCss).toContain("--neon-right-near-inward: -18px");
  expect(neonCss).toContain("transform-origin: left 88%");
  expect(neonCss).toContain("transform-origin: right 88%");

  const edgeDurations = [
    ...neonCss.matchAll(
      /animation:\s*neon-edge-[\w-]+\s+(\d+)s/g
    )
  ].map((match) => Number(match[1]));

  expect(edgeDurations).toHaveLength(6);
  expect(Math.max(...edgeDurations)).toBeLessThanOrEqual(24);
  expect(Math.min(...edgeDurations)).toBeLessThanOrEqual(13);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
npx vitest run src/indexCss.test.ts
```

Expected: FAIL because the inward-travel custom properties and lower-edge
transform origins do not exist, and the current maximum duration is 32 seconds.

- [ ] **Step 3: Add responsive travel properties and lower-edge anchors**

In `src/animations/neon-background/neon-background.css`, add these desktop
values to `.neon-bg`:

```css
--neon-left-near-rest: -8px;
--neon-left-near-inward: 32px;
--neon-left-mid-rest: -5px;
--neon-left-mid-inward: 22px;
--neon-left-far-rest: -3px;
--neon-left-far-inward: 13px;
--neon-right-near-rest: 8px;
--neon-right-near-inward: -32px;
--neon-right-mid-rest: 5px;
--neon-right-mid-inward: -22px;
--neon-right-far-rest: 3px;
--neon-right-far-inward: -13px;
```

Set the edge anchors:

```css
.neon-bg__edge--left {
  left: 0;
  transform-origin: left 88%;
}

.neon-bg__edge--right {
  right: 0;
  transform-origin: right 88%;
}
```

Inside `@media (max-width: 640px)`, override the six inward values to `18px`,
`12px`, `8px`, `-18px`, `-12px`, and `-8px`, respectively.

- [ ] **Step 4: Replace the six imperceptible animations**

Use durations `12s`, `16s`, `21s`, `13s`, `17s`, and `23s`. Give every layer
a distinct negative delay and use
`cubic-bezier(0.45, 0.05, 0.55, 0.95) infinite`.

Each keyframe must start and end at its corresponding `*-rest` variable and
reach its `*-inward` variable around the middle of the cycle. Near layers use
up to eight pixels of vertical float and one degree of rotation; middle and
far layers use progressively smaller values. Example:

```css
@keyframes neon-edge-left-near {
  0%,
  100% {
    transform:
      translate3d(var(--neon-left-near-rest), 7px, 0)
      scale(1.015)
      rotate(-0.8deg);
  }
  48% {
    transform:
      translate3d(var(--neon-left-near-inward), -8px, 0)
      scale(1.025)
      rotate(0.95deg);
  }
}
```

Mirror the direction—not the duration or phase—for the right side. Do not
change spark keyframes or add any animated property other than `transform` and
`opacity`.

- [ ] **Step 5: Run the focused tests and verify GREEN**

Run:

```powershell
npx vitest run src/indexCss.test.ts src/animations/neon-background/NeonBackground.test.tsx src/App.test.tsx
```

Expected: PASS with the same structure and performance constraints plus the
new travel and timing contract.

- [ ] **Step 6: Commit the motion change**

```powershell
git add -- src/indexCss.test.ts src/animations/neon-background/neon-background.css
git diff --cached
git commit -m "feat: make landing tendrils visibly sway"
```

---

### Task 2: Verify the landing and motion lab

**Files:**
- Modify only if verification exposes a defect, with a failing regression test first.

**Interfaces:**
- Consumes: the tuned `NeonBackground` module.
- Produces: a visually verified landing page and motion lab with no regression to performance, accessibility, or layout.

- [ ] **Step 1: Verify perceptible movement at desktop and mobile sizes**

At `1280×720` and `390×844`, capture computed transforms, wait two seconds,
and capture them again. Confirm all six edge transforms changed. Visually
inspect frames separated by four seconds and confirm the near layers have
clearly moved toward or away from the center without crossing central content.

- [ ] **Step 2: Verify the motion lab and reduced-motion contract**

At `/motion-lab`, confirm Pause freezes the tendril transforms and `2x`
increases all lab animation playback rates. Emulate
`prefers-reduced-motion: reduce` and confirm all six edge layers and eight
sparks report `animation-name: none`.

- [ ] **Step 3: Verify layout and browser health**

At 375 CSS pixels, confirm:

```js
document.documentElement.scrollWidth ===
  document.documentElement.clientWidth
```

Confirm the browser console has no errors and the center content remains
legible at both verification sizes.

- [ ] **Step 4: Run full verification**

Run:

```powershell
npm test
npx tsc -b
npm run build
git diff --check
git status --short --branch
```

Expected: all tests pass, TypeScript and the production build exit zero,
`git diff --check` prints no errors, and the worktree is clean after the motion
commit.
