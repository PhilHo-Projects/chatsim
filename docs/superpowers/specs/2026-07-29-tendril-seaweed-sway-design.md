# Tendril Seaweed Sway Design

**Date:** 2026-07-29

## Goal

Make the landing-page tendrils visibly move like slow underwater seaweed while
preserving the near-black center, restrained visual style, and inexpensive
transform-only rendering.

## Scope

This change tunes the existing six SVG edge layers and eight sparks. It does
not add WebGL, canvas, JavaScript animation loops, new SVG geometry, new
dependencies, or a second background component. The `/motion-lab` route stays
in place and continues to render the same `NeonBackground` module used by the
landing page.

## Motion Design

The six edge layers remain split into near, middle, and far depth groups on
each side. Their SVG path geometry remains static.

- Near layers sway approximately 28–36 pixels toward the center over 10–14
  seconds.
- Middle layers sway approximately 18–26 pixels toward the center over 14–18
  seconds.
- Far layers sway approximately 10–16 pixels toward the center over 18–24
  seconds.
- Each layer also gets a small vertical float and roughly one degree or less
  of rotation.
- Left and right layers use different durations and phases so they do not
  mirror each other.
- Motion is anchored toward the lower outer edge so it reads as bending rather
  than a flat sheet sliding.
- Narrow viewports use smaller travel distances to avoid covering central
  content.
- Sparks retain their independent opacity and transform breathing motion.

Only `transform` and spark `opacity` may animate. The existing prohibitions on
filters, backdrop filters, blend modes, stroke-dash animation, and SVG path
morphing remain in force.

## Accessibility and Performance

`prefers-reduced-motion: reduce` continues to disable all decorative
background motion. The component remains `aria-hidden` and pointer-event free.
The center remains visually clear and the page must not gain horizontal
overflow at 375 CSS pixels.

## Testing and Verification

Before changing production CSS, add a failing stylesheet contract test that
requires:

- seaweed motion durations no longer exceed the approved 24-second maximum;
- the near layers travel at least 28 pixels toward the center;
- lower-edge transform origins are present;
- the existing transform/opacity-only performance constraints remain intact.

After implementation:

- run the focused neon, stylesheet, and app tests;
- visually compare two landing-page frames several seconds apart at 1280×720
  and 390×844;
- confirm movement is readily perceptible without covering central content;
- verify `/motion-lab` still controls the real background animation;
- confirm reduced motion, zero horizontal overflow at 375 pixels, a clean
  console, TypeScript, the full test suite, and the production build.
