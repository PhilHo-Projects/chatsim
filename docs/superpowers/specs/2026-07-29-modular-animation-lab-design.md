# Modular Animation Lab Design

**Date:** 2026-07-29

## Goal

Make animation code small, feature-owned, cheap to render, and easy to swap or
tune without reopening the application's global stylesheet. Add a local motion
lab at `/motion-lab` so animations can be judged in isolation before they are
used in the landing page, conversations, or battle stories.

## Scope

This change will:

- split the existing neon, conversation, and battle motion rules out of
  `src/index.css`;
- move `NeonBackground` beside its stylesheet and tests under
  `src/animations/neon-background/`;
- add a focused `/motion-lab` route with live previews and play/pause plus
  `0.5x`, `1x`, and `2x` playback controls;
- make the landing tendrils more visibly alive by animating several independent
  edge layers instead of moving one SVG per side;
- keep the center of the landing page clear and the base color near-black;
- preserve the existing conversation, battle, landing, profile, and story
  behavior outside motion organization and tendril tuning.

This change will not add WebGL, canvas, path morphing, new dependencies, a
production navigation link to the lab, or a generalized animation framework.

## File Boundaries

```text
src/
  animations/
    shared/
      reduced-motion.css
    neon-background/
      NeonBackground.tsx
      NeonBackground.test.tsx
      neon-background.css
    conversation/
      conversation-motion.css
    battle/
      battle-motion.css
    motion-lab/
      MotionLab.tsx
      MotionLab.test.tsx
      motion-lab.css
```

`src/index.css` remains the owner of Tailwind, theme tokens, reset rules,
application backgrounds, and non-motion shell styles. Each feature stylesheet
is imported by the component that consumes it. The shared reduced-motion file
is imported once from `src/main.tsx`.

The lab imports the real feature styles and renders small representative
samples. It does not copy keyframes into a second stylesheet.

## Tendril Rendering

The tendril paths remain static SVG geometry. The component will distribute the
ten paths across three SVG layers on each side. Each entire SVG layer moves with
CSS `transform`; sparks use only `transform` and `opacity`.

The layers use different cycles in the approximate 18–32 second range and move
only a few pixels with sub-degree rotation. This produces visible parallax while
remaining restrained. Spark cycles remain staggered and add a small positional
drift to the existing brightness pulse.

The neon module must not use:

- CSS or SVG filters;
- `backdrop-filter`;
- `mix-blend-mode`;
- animated `stroke-dashoffset`;
- animated SVG path data;
- dash animation inside a painted or blurred layer.

`will-change` is limited to the six edge SVG layers and the eight sparks.
Reduced-motion disables the module animations.

## Motion Lab

`/motion-lab` is a deliberately unlinked route intended for local iteration.
It contains:

- a full-size neon tendril preview over the real near-black base;
- compact conversation and battle motion samples using the extracted
  keyframes;
- a module label and a short note describing what properties animate;
- global lab controls for play/pause and `0.5x`, `1x`, or `2x` playback.

Playback controls act only on animations inside the lab container. They prefer
the Web Animations API and fall back to scoped inline animation duration and
play-state overrides when that API is unavailable. Fallback styles are restored
when the lab unmounts. The controls do not mutate application preferences, CSS
files, or production route state. A “Back to app” control returns to `/`.

The route is parsed and formatted by the existing app route helper. Unknown
routes continue to fall back to home.

## Error and Accessibility Behavior

- If the browser does not expose the Web Animations API, the lab uses its
  scoped CSS fallback; an unparseable duration remains unchanged.
- The lab controls use native buttons with visible focus treatment and pressed
  state where applicable.
- The decorative neon background remains `aria-hidden`.
- `prefers-reduced-motion: reduce` wins over lab playback controls; the lab
  explains that motion is disabled by the operating-system preference.
- The page must not introduce horizontal overflow at 375 CSS pixels.

## Tests and Verification

Automated tests will verify:

- `/motion-lab` parses and formats under both root and configured base paths;
- the lab renders its three module samples and accessible controls;
- the neon component renders three layers per side, ten total paths, and eight
  sparks without SVG filters or path-level animation;
- the neon stylesheet contains only compositor-friendly animated properties
  and none of the prohibited effects;
- `src/index.css` no longer owns feature keyframes;
- conversation and battle consumers still receive their feature styles.

Manual browser verification will cover 1280×720 and 390×844:

- all six tendril layers and eight sparks are visibly moving;
- play/pause and playback-rate controls work inside `/motion-lab`;
- the landing page uses the tuned motion without obscuring the center;
- reduced motion stops decorative animation;
- the console is clean and 375-pixel layouts have no horizontal scroll.

The full Postgres-backed test suite, TypeScript build, and production build must
pass before completion.
