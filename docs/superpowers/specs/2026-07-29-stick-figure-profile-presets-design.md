# Stick-Figure Profile Presets Design

**Date:** 2026-07-29

## Goal

Replace the noisy handle-generated filament art on public profile cards with
five calm, distinct, code-authored SVG stick-figure presets. Keep uploaded or
curated imagery confined to story tiles after a visitor enters a profile.

## Scope

This change will:

- create five reusable SVG profile presets;
- explicitly assign one preset to `@phil` and each of the four demo profiles;
- render the presets on featured deck cards and compact profile-directory
  icons;
- honor uploaded story covers only on story tiles inside selected profiles;
- retain the existing curated and fallback story-cover behavior;
- keep stable preset identifiers for a future account picker.

This change will not add profile-editing UI, a database column, an API field,
image uploads, AI-generated assets, animation, or new dependencies.

## Preset Catalog

The preset identifiers and initial assignments are:

| Preset ID | Pose | Initial profile |
| --- | --- | --- |
| `sitting` | Seated/slouched with bent legs | `@phil` |
| `waving` | Standing with one raised arm | `@demo-01` |
| `leaning` | Diagonal stance with one supporting arm | `@demo-02` |
| `walking` | Mid-stride with opposing arms and legs | `@demo-03` |
| `floating` | Open stance with arms spread | `@demo-04` |

Assignments are keyed by stable profile ID rather than username. Unknown
profiles receive a deterministic fallback preset from the same catalog, based
on their profile ID. This avoids a sixth visual system while selection remains
out of scope.

Preset IDs must remain stable. A future profile picker can persist one of these
IDs without changing the renderer or existing artwork.

## Visual Language

Each preset is an inline SVG rendered through one shared component:

- full viewBox: `0 0 300 400`;
- compact directory view: a square crop of the same composition with slightly
  heavier strokes;
- near-black `#08070b` base;
- simple head circle and curved or straight body/limb strokes;
- one primary and one secondary color drawn only from `--neon-1` through
  `--neon-4`;
- at most two faint supporting marks, such as a ground arc or small node;
- no filters, blur, glow duplication, gradients, generated noise, or
  animation.

The pose must remain recognizable at 36 pixels. Large deck art should feel
deliberate and sparse rather than like an enlarged icon.

## Component Boundaries

Create a focused profile-avatar module:

```text
src/
  profile-avatars/
    ProfileAvatar.tsx
    ProfileAvatar.test.tsx
    profileAvatarPresets.ts
    profileAvatarPresets.test.ts
```

`profileAvatarPresets.ts` owns the five stable IDs, pose geometry, theme-token
colors, explicit showcase assignments, and deterministic fallback selection.
`ProfileAvatar.tsx` owns SVG rendering and the full/compact presentation
variants.

`LandingPage.tsx` uses `ProfileAvatar` for:

- each featured profile card background;
- each compact row icon in the profile directory.

The existing filament renderer remains available only as a fallback for story
tiles without a curated or uploaded cover. Its local wrapper should be renamed
from the profile-oriented `ProfileArtwork` name to `StoryFallbackArtwork` so
the profile/story image boundary is explicit in code.

The selected-profile header remains handle and bio only.

## Story Image Boundary

Entering a profile continues to show the story bento grid. A story tile uses:

1. `story.coverImage.variants.card` when an uploaded cover is present;
2. its existing curated bundled cover when one is mapped;
3. the existing deterministic filament fallback otherwise.

Profile preset art never replaces a real story cover. User-uploaded avatar or
storyboard-speaker imagery is not rendered on the public deck or directory.
The API and store already expose story-cover references, so honoring the card
variant requires no migration or upload-pipeline change.

## Accessibility and Failure Behavior

Profile preset SVGs remain decorative with `aria-hidden="true"` because the
surrounding buttons already expose profile handle and story count.

An unknown or missing profile assignment must resolve to a deterministic
catalog preset rather than render an empty card or throw. Invalid preset IDs
are not accepted by the typed catalog.

## Testing and Verification

Automated tests will verify:

- exactly five stable preset IDs exist and each geometry is distinct;
- all preset colors come from the four approved neon tokens;
- each showcase profile maps to its specified preset;
- unknown profile IDs resolve deterministically to one of the five presets;
- full and compact SVG variants render without filters or animation;
- featured cards and directory rows render the assigned preset;
- selected-profile story tiles prefer uploaded covers, then curated covers,
  and retain the filament fallback when neither exists;
- existing profile handles, bios, search, carousel, and story navigation still
  work.

Browser verification at `1280×720` and `390×844` will confirm that the five
poses are visually distinct, readable at directory size, restrained at deck
size, do not obscure text, and introduce no horizontal overflow or console
errors.

## Explicit Follow-Up

Add an authenticated profile picker later. It can expose the stable catalog,
persist a chosen preset through a dedicated profile field, and expand the
catalog after a broader visual theme is chosen. That persistence and editing
surface are deliberately outside this pass.
