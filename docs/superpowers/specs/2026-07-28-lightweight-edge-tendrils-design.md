# Lightweight Edge Tendrils Design

**Status:** Approved
**Date:** 2026-07-28
**Supersedes:** The animated-background and glass-performance portions of
`2026-07-27-landing-neon-theme-and-identity-design.md`

## Goal

Keep the near-black neon browsing identity while making the landing page smooth
to scroll and visually calmer. The background should resemble delicate threads
floating in from the corners and sides, with an intentionally empty center and
small coloured sparks that slowly brighten and dim.

This is a focused rendering and visual-density revision. Profile identity,
search behaviour, routing, account behaviour, the phone player, and the script
editors do not change.

## Problem

The existing implementation combines several expensive rendering operations:

- 22 animated SVG dash paths and 26 independently pulsing nodes;
- full-viewport `blur(110px)` and `blur(13px)` layers;
- `screen` and `plus-lighter` blend modes;
- `backdrop-filter` on scrolling surfaces;
- CSS `filter: blur(...)` transitions on deck cards whose contents already use
  SVG Gaussian blur; and
- `overflow-hidden` on the app shell, which prevents the sticky top bar from
  remaining sticky while the document scrolls.

The live landing page exposes 51 continuous animations before interaction. The
result is visually busier than the supplied reference and causes visible
scrolling and deck-transition stutter.

## Chosen Approach

Use two small, fixed edge SVGs: one for the left/corner cluster and one for the
right/corner cluster. The paths are static within each SVG. Each complete edge
SVG receives one very slow `transform` animation, so the browser moves a
rasterized layer instead of repainting individual path geometry.

Small sparks are separate lightweight elements animated only with `opacity` and
minor `transform` changes. No WebGL, Canvas, JavaScript animation loop, blur
filter, or blend mode is required.

Rejected alternatives:

- **Static artwork with animated sparks:** cheapest, but the strings would not
  have the requested floating motion.
- **Canvas 2D:** offers more procedural motion but adds a perpetual JavaScript
  rendering loop and device-pixel-ratio management for a scene that does not
  need it.
- **WebGL:** appropriate for hundreds or thousands of animated particles, but
  excessive for roughly ten curves and eight sparks.

## Visual Design

### Base and composition

- Page base remains `#050507`.
- The middle 60% of the viewport stays visually clear.
- Tendrils occupy the left and right side bands and curl around the top and
  bottom corners.
- No coloured haze sits behind the edge clusters; the unoccupied background is
  the base colour.
- There is no full-screen haze, bloom, or animated vignette.

### Tendrils

- Ten paths total, five per side.
- Hairline widths range from `0.45px` to `1.1px`.
- Colours use the existing pink, cyan, purple, and sky neon tokens, plus a
  restrained warm amber token local to this decorative background.
- Path opacity stays roughly between `0.18` and `0.48`.
- Paths are continuous, non-dashed curves. No highlight travels along a path.
- The two side groups use different 28–42 second transform cycles with very
  small translation, rotation, and scale changes.
- Path-level animation is forbidden.

### Sparks

- Eight sparks total, distributed asymmetrically around the edges and corners.
- Sparks use the same decorative colours as the tendrils.
- Diameter ranges from roughly `2px` to `5px`.
- Each spark animates opacity and a sub-pixel or one-pixel scale change on a
  staggered 5–11 second cycle.
- Sparks do not use `filter`, `box-shadow`, or a blurred pseudo-element.

## Component and CSS Changes

### `NeonBackground`

Replace seeded full-field geometry with explicit left and right edge geometry.
Hand-authored paths are preferred here because the composition is small,
intentional, and tied to a clear-center requirement.

The component renders:

1. a fixed inert `.neon-bg` container;
2. a left edge SVG;
3. a right edge SVG;
4. eight spark elements.

There is no duplicated glow/core geometry and no SVG `<filter>`.

### Shell surfaces

Remove live `backdrop-filter` from `.app-glass`, the top bar, and both
navigation variants. Use a mostly opaque near-black surface instead, preserving
the existing border and text contrast.

Replace the app shell's `overflow-hidden` with horizontal-only clipping so the
document can scroll normally and the sticky top bar remains pinned.

### Featured deck

Deck cards retain their circular placement, scale, rotation, opacity, keyboard
controls, autoplay, and pause rules.

Remove CSS blur from `getDeckCardStyle` and remove `filter` from the transition
list. Cards animate only `transform` and `opacity`.

### Generated profile art

Remove `feGaussianBlur`. Render a wider, lower-opacity duplicate stroke behind
each core stroke to provide slight depth without a filter. Profile art remains
deterministic and handle-derived.

## Performance Budget

The landing background must meet all of these structural constraints:

- no more than 10 continuous animations in normal motion mode;
- no animated property other than `transform` or `opacity`;
- no CSS `filter` or `backdrop-filter` on the browsing route;
- no SVG `<filter>` in background or generated profile artwork;
- no `mix-blend-mode`;
- no path-level animation; and
- no JavaScript animation loop.

These are guardrails rather than a claim that every compositor decision is
guaranteed. Live browser verification remains required.

## Responsive Behaviour

At 1280×720, edge clusters occupy no more than 24% of each side. At
390×844, they narrow so the central content column remains legible. Curves may
sit behind content near the extreme corners, but not create a bright band under
body text.

The page must have no horizontal overflow at 375px. The top bar must remain at
the top of the viewport while scrolling.

## Reduced Motion

Under `prefers-reduced-motion: reduce`, both edge-group drift animations and all
spark pulses stop. The static tendrils and sparks remain visible.

## Testing

Automated tests will cover:

- the exact tendril and spark density;
- absence of SVG filters and per-path animation;
- absence of background blur, blend modes, and glass `backdrop-filter`;
- deck styles containing no CSS filter and transitioning only transform and
  opacity;
- generated profile art containing no `feGaussianBlur`;
- the app shell using horizontal clipping rather than broad overflow hiding;
  and
- existing route, search, deck, account, and story-player behaviour.

Browser verification will cover:

- visual comparison against the approved dark edge-tendril direction at
  1280×720 and 390×844;
- a clearly near-black and uncluttered center;
- slow, subtle string drift and independently fading coloured sparks;
- smooth wheel/touch scrolling and deck autoplay;
- a sticky top bar and no horizontal overflow at 375px;
- visible keyboard focus;
- reduced-motion behaviour; and
- a clean console.

## Acceptance Criteria

The change is complete when the landing page reads as dark and quiet, animated
detail stays predominantly at the corners and sides, scrolling no longer
visibly stutters in the local preview, the sticky header works, all structural
performance constraints pass, and the complete automated test/build suite is
green.
