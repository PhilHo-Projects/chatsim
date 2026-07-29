# Modular Animation Lab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split feature motion out of the global stylesheet, add an isolated `/motion-lab`, and make the neon edge tendrils visibly drift through cheap compositor-only layers.

**Architecture:** Feature motion lives in the focused `neon-background`, `conversation`, and `battle` directories under `src/animations/` and is imported by its consumers. The motion lab renders the real feature keyframes and controls its descendant animations through the Web Animations API; the landing page reuses the same `NeonBackground` module.

**Tech Stack:** React 19, TypeScript, Vite, Tailwind 4, CSS animations, Web Animations API, Vitest, Testing Library.

## Global Constraints

- Do not add WebGL, canvas, path morphing, new dependencies, a production navigation link, or a generalized animation framework.
- Neon motion may animate only `transform` and `opacity`.
- Neon motion must not use CSS/SVG filters, `backdrop-filter`, `mix-blend-mode`, animated `stroke-dashoffset`, animated SVG path data, or dash animation.
- Keep the landing base at `#050507` and keep the center visually clear.
- `prefers-reduced-motion: reduce` must disable decorative motion.
- The motion lab must not introduce horizontal overflow at 375 CSS pixels.
- Work inline in the current repository; do not dispatch subagents.

---

### Task 1: Extract feature-owned motion styles

**Files:**
- Create: `src/animations/shared/reduced-motion.css`
- Create: `src/animations/conversation/conversation-motion.css`
- Create: `src/animations/battle/battle-motion.css`
- Create: `src/animations/neon-background/neon-background.css`
- Move: `src/components/NeonBackground.tsx` to `src/animations/neon-background/NeonBackground.tsx`
- Move: `src/components/NeonBackground.test.tsx` to `src/animations/neon-background/NeonBackground.test.tsx`
- Modify: `src/index.css`
- Modify: `src/indexCss.test.ts`
- Modify: `src/main.tsx`
- Modify: `src/components/AppShell.tsx`
- Modify: `src/components/MessageBubble.tsx`
- Modify: `src/components/MessageList.tsx`
- Modify: `src/components/TypingIndicator.tsx`
- Modify: `src/components/ConversationPreview.tsx`
- Modify: `src/components/BattleStoryPlayer.tsx`

**Interfaces:**
- Consumes: existing CSS class names and keyframe names `bubble-in`, `typing-dot`, `battle-bob`, `battle-blink`, and `neon-*`.
- Produces: `NeonBackground` exported from `src/animations/neon-background/NeonBackground.tsx`; feature styles loaded by the components that consume them.

- [ ] **Step 1: Change the CSS ownership test so the old layout fails**

Update `src/indexCss.test.ts` to read the new feature styles and assert that
`src/index.css` contains none of the feature keyframes:

```ts
const globalCss = readFileSync("src/index.css", "utf8");
const conversationCss = readFileSync(
  "src/animations/conversation/conversation-motion.css",
  "utf8"
);
const battleCss = readFileSync(
  "src/animations/battle/battle-motion.css",
  "utf8"
);
const neonCss = readFileSync(
  "src/animations/neon-background/neon-background.css",
  "utf8"
);

expect(globalCss).not.toMatch(
  /@keyframes (bubble-in|typing-dot|battle-bob|battle-blink|neon-)/
);
expect(conversationCss).toContain("@keyframes bubble-in");
expect(conversationCss).toContain("@keyframes typing-dot");
expect(battleCss).toContain("@keyframes battle-bob");
expect(battleCss).toContain("@keyframes battle-blink");
expect(neonCss).toContain("@keyframes neon-");
```

- [ ] **Step 2: Run the ownership test and verify RED**

Run: `npx vitest run src/indexCss.test.ts`

Expected: FAIL because the feature styles do not exist and the global
stylesheet still owns the keyframes.

- [ ] **Step 3: Move the styles and component without changing behavior**

Create the four focused stylesheets, remove their rules from `src/index.css`,
move `NeonBackground` and its test, and add these imports:

```ts
// src/animations/neon-background/NeonBackground.tsx
import "./neon-background.css";

// src/components/MessageBubble.tsx, MessageList.tsx,
// TypingIndicator.tsx, ConversationPreview.tsx
import "../animations/conversation/conversation-motion.css";

// src/components/BattleStoryPlayer.tsx
import "../animations/battle/battle-motion.css";

// src/main.tsx
import "./animations/shared/reduced-motion.css";

// src/components/AppShell.tsx
import { NeonBackground } from "../animations/neon-background/NeonBackground";
```

Keep every existing keyframe body and class name byte-for-byte equivalent
during this task.

- [ ] **Step 4: Run the focused style and component tests**

Run:
`npx vitest run src/indexCss.test.ts src/animations/neon-background/NeonBackground.test.tsx src/App.test.tsx`

Expected: PASS with the same landing, conversation, and battle behavior.

- [ ] **Step 5: Commit the mechanical split**

```bash
git add src/index.css src/indexCss.test.ts src/main.tsx src/components src/animations
git commit -m "refactor: split feature animation styles"
```

---

### Task 2: Layer and tune the neon tendrils

**Files:**
- Modify: `src/animations/neon-background/NeonBackground.tsx`
- Modify: `src/animations/neon-background/NeonBackground.test.tsx`
- Modify: `src/animations/neon-background/neon-background.css`
- Modify: `src/indexCss.test.ts`

**Interfaces:**
- Consumes: `NeonBackground` from Task 1 and the existing ten tendril paths plus eight spark definitions.
- Produces: three `.neon-bg__edge` SVG layers per side, ten static paths total, and eight transform/opacity sparks.

- [ ] **Step 1: Write the failing layered-render test**

Change the neon component test to require six SVG layers while retaining the
existing path and spark counts:

```ts
expect(container.querySelectorAll(".neon-bg__edge--left")).toHaveLength(3);
expect(container.querySelectorAll(".neon-bg__edge--right")).toHaveLength(3);
expect(container.querySelectorAll(".neon-bg path")).toHaveLength(10);
expect(container.querySelectorAll(".neon-bg__spark")).toHaveLength(8);
```

Extend the stylesheet test to reject expensive properties and require six
layer animation names:

```ts
expect(neonCss).not.toMatch(
  /filter:|backdrop-filter|mix-blend-mode|stroke-dashoffset/
);
expect(neonCss.match(/@keyframes neon-edge-/g)).toHaveLength(6);
```

- [ ] **Step 2: Run the neon tests and verify RED**

Run:
`npx vitest run src/animations/neon-background/NeonBackground.test.tsx src/indexCss.test.ts`

Expected: FAIL because the component still renders one SVG per side and only
two edge keyframes exist.

- [ ] **Step 3: Render three static-path SVG layers per side**

Replace the two flat tendril arrays with layer definitions:

```ts
type TendrilLayer = {
  className: string;
  tendrils: readonly Tendril[];
};

const EDGE_LAYERS: readonly TendrilLayer[] = [
  { className: "neon-bg__edge--left neon-bg__edge--left-near", tendrils: LEFT_TENDRILS.slice(0, 2) },
  { className: "neon-bg__edge--left neon-bg__edge--left-mid", tendrils: LEFT_TENDRILS.slice(2, 4) },
  { className: "neon-bg__edge--left neon-bg__edge--left-far", tendrils: LEFT_TENDRILS.slice(4) },
  { className: "neon-bg__edge--right neon-bg__edge--right-near", tendrils: RIGHT_TENDRILS.slice(0, 2) },
  { className: "neon-bg__edge--right neon-bg__edge--right-mid", tendrils: RIGHT_TENDRILS.slice(2, 4) },
  { className: "neon-bg__edge--right neon-bg__edge--right-far", tendrils: RIGHT_TENDRILS.slice(4) }
];
```

Map `EDGE_LAYERS` to six `EdgeTendrils` instances. Keep animation styles off
every `<path>`.

- [ ] **Step 4: Add restrained transform-only parallax**

Define six `neon-edge-*` keyframes with staggered 18–32 second durations.
Each keyframe may use only `translate3d`, `scale`, and sub-degree `rotate`.
Extend `neon-spark-breathe` with a maximum three-pixel `translate3d` drift
while retaining opacity/scale pulsing.

- [ ] **Step 5: Run the focused tests and verify GREEN**

Run:
`npx vitest run src/animations/neon-background/NeonBackground.test.tsx src/indexCss.test.ts src/App.test.tsx`

Expected: PASS; six edge layers, ten paths, and eight sparks are present with
no prohibited effects.

- [ ] **Step 6: Commit the tuned neon module**

```bash
git add src/animations/neon-background src/indexCss.test.ts
git commit -m "feat: add layered tendril parallax"
```

---

### Task 3: Add the isolated motion lab

**Files:**
- Create: `src/animations/motion-lab/MotionLab.tsx`
- Create: `src/animations/motion-lab/MotionLab.test.tsx`
- Create: `src/animations/motion-lab/motion-lab.css`
- Modify: `src/navigation/appRoute.ts`
- Modify: `src/navigation/appRoute.test.ts`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`

**Interfaces:**
- Consumes: `NeonBackground`, the extracted conversation and battle keyframes, and `AppRoute`.
- Produces: `MotionLab({ onBack }: { onBack: () => void })` and the route `{ name: "motionLab" }`, formatted as `/motion-lab`.

- [ ] **Step 1: Write the failing route test**

Add:

```ts
expect(parseAppRoute("/motion-lab")).toEqual({ name: "motionLab" });
expect(formatAppRoute({ name: "motionLab" })).toBe("/motion-lab");
expect(parseAppRoute("/chatsim/motion-lab", "/chatsim/")).toEqual({
  name: "motionLab"
});
expect(formatAppRoute({ name: "motionLab" }, "/chatsim/")).toBe(
  "/chatsim/motion-lab"
);
```

- [ ] **Step 2: Run the route test and verify RED**

Run: `npx vitest run src/navigation/appRoute.test.ts`

Expected: FAIL because `motionLab` is not an `AppRoute`.

- [ ] **Step 3: Add the route union, parser, and formatter**

Add `{ name: "motionLab" }` to `AppRoute`, parse the single path part
`motion-lab`, and format it through `addBasePath("/motion-lab", basePath)`.

- [ ] **Step 4: Write the failing motion-lab component test**

Render `<MotionLab onBack={onBack} />` and assert:

```ts
expect(screen.getByRole("heading", { name: "Motion lab" })).toBeVisible();
expect(screen.getByText("Neon tendrils")).toBeVisible();
expect(screen.getByText("Conversation motion")).toBeVisible();
expect(screen.getByText("Battle motion")).toBeVisible();
expect(screen.getByRole("button", { name: "Pause animations" })).toBeVisible();
expect(screen.getByRole("button", { name: "Set animation speed to 2x" })).toBeVisible();
fireEvent.click(screen.getByRole("button", { name: "Back to app" }));
expect(onBack).toHaveBeenCalledOnce();
```

- [ ] **Step 5: Run the component test and verify RED**

Run: `npx vitest run src/animations/motion-lab/MotionLab.test.tsx`

Expected: FAIL because the component does not exist.

- [ ] **Step 6: Implement the lab and scoped playback controls**

Use a container ref and synchronize only descendant animations:

```ts
const animations =
  labRef.current?.getAnimations({ subtree: true }) ?? [];

for (const animation of animations) {
  animation.playbackRate = playbackRate;
  if (isPaused) {
    animation.pause();
  } else {
    animation.play();
  }
}
```

Render the real `NeonBackground`, one bubble/typing sample using conversation
keyframes, and one pixel/bob/blink sample using battle keyframes. Style the lab
as a near-black, overflow-safe page with a sticky translucent control panel.

- [ ] **Step 7: Wire `/motion-lab` into `App`**

After all hooks have run, render:

```tsx
if (route.name === "motionLab") {
  return <MotionLab onBack={() => navigate({ name: "home" })} />;
}
```

Add an app test that starts history at `/motion-lab`, renders `App`, and finds
the `Motion lab` heading instead of the profile directory.

- [ ] **Step 8: Run route, lab, and app tests**

Run:
`npx vitest run src/navigation/appRoute.test.ts src/animations/motion-lab/MotionLab.test.tsx src/App.test.tsx`

Expected: PASS with direct route loading, accessible controls, and back
navigation.

- [ ] **Step 9: Commit the motion lab**

```bash
git add src/animations/motion-lab src/navigation/appRoute.ts src/navigation/appRoute.test.ts src/App.tsx src/App.test.tsx
git commit -m "feat: add modular motion lab"
```

---

### Task 4: Verify behavior and rendering

**Files:**
- Modify only if verification exposes a defect, with a failing regression test first.

**Interfaces:**
- Consumes: the completed animation modules and `/motion-lab`.
- Produces: a clean, verified local `main` with the dev preview left running at port 5174.

- [ ] **Step 1: Run all automated verification**

Run:

```powershell
$env:TEST_DATABASE_URL='postgresql://chatsim_dev:chatsim_dev@127.0.0.1:55439/chatsim_test'
$env:DATABASE_URL='postgresql://chatsim_dev:chatsim_dev@127.0.0.1:55439/chatsim_dev'
npm test
npx tsc -b
npm run build
git diff --check
```

Expected: all tests pass, TypeScript exits 0, the production build exits 0,
and `git diff --check` prints no errors.

- [ ] **Step 2: Browser-check the motion lab at 1280×720 and 390×844**

Verify:

- six tendril SVG layers and eight sparks are running;
- transforms change across two animation samples;
- Pause freezes lab animation current times;
- `2x` increases playback rate only inside the lab;
- Back to app navigates to `/`;
- the console has no errors;
- `document.documentElement.scrollWidth === document.documentElement.clientWidth`
  at 375 CSS pixels.

- [ ] **Step 3: Browser-check the landing and story routes**

Verify:

- the landing center remains clear over `#050507`;
- scrolling stays responsive and the sticky shell remains fixed;
- story routes contain no `.neon-bg`;
- the coffee-shop story background still paints.

- [ ] **Step 4: Commit any verification fix**

If a defect required a code change, stage only files within this feature's
explicit scope and review the staged diff before committing:

```bash
git add -- src/animations src/index.css src/indexCss.test.ts src/main.tsx src/App.tsx src/App.test.tsx src/navigation/appRoute.ts src/navigation/appRoute.test.ts src/components/AppShell.tsx src/components/MessageBubble.tsx src/components/MessageList.tsx src/components/TypingIndicator.tsx src/components/ConversationPreview.tsx src/components/BattleStoryPlayer.tsx
git diff --cached
git commit -m "fix: correct motion lab verification defect"
```

If no defect required a change, do not create an empty commit.
