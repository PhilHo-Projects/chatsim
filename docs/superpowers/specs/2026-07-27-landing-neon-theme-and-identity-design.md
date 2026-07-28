# Landing Neon Theme and Profile Identity Design

**Status:** Approved direction, ready for an implementation plan.
**Date:** 2026-07-27

## Goal

Give the browsing shell one committed look — near-black with animated neon
tendrils — and fix the profile identity model underneath it. Today a profile
carries a title, a handle, and a full-bleed story illustration, which together
produce rows like `neon sleepover @neon` where none of the three parts explain
the other two. After this change a profile is a handle, a description, and a
generated card. Nothing else.

Scope is the browsing shell: `AppShell`, `LandingPage`, `AccountPanel`, and the
profile records behind them. The phone player and both script editors are out
of scope and keep their current light treatment.

## Decisions

| Question | Decision |
| --- | --- |
| Palette | Spectrum neon on near-black |
| Background | 22 animated tendrils, three layers, CSS + inline SVG only |
| Profile art | Generated from the handle; uploads still allowed |
| Profile title | Removed from the UI; handle only |
| Description | New `bio` column, 160 characters |
| Demo accounts | `@demo-01` … `@demo-04`, self-describing bios |
| Search | Moves between the deck and the list |
| Light mode | Removed from shell and landing |

## 1. Theme Tokens

One palette. No light variant, no runtime toggle.

```
--neon-1  #ff2d78   hot pink
--neon-2  #22d3ee   cyan
--neon-3  #a855f7   purple
--neon-4  #38bdf8   sky
--base    #050507   page
--surface rgba(10, 9, 13, 0.62)   glass panels
--line    rgba(255, 255, 255, 0.09)
--text    #f6eef4
--muted   #9a8d99
```

Tokens live in `src/index.css` next to the existing `@theme` block. Every
neon-derived colour in the app — background, card art, badges, focus rings —
resolves from `--neon-1` through `--neon-4`, so re-hueing the whole product
later is a four-line edit. This was verified in the mockup by swapping four
values and watching the background, card art, badges and glass all recolour
together.

Removing light mode deletes:

- `THEME_STORAGE_KEY`, `getInitialTheme`, the `theme` state and `toggleTheme`
  in `src/App.tsx`
- both theme-toggle buttons in `src/components/AppShell.tsx`
- the `@custom-variant dark` declaration in `src/index.css`
- all 31 `dark:` class variants, which a grep confirms exist only in
  `AppShell.tsx` (17) and `LandingPage.tsx` (14)

No other file references dark mode, so this cannot reach the phone or editors.

## 2. Animated Background

Three fixed layers behind the shell, in `src/index.css` plus one small React
component that emits the SVG. No WebGL, no canvas, no shader.

| Layer | Content | Motion |
| --- | --- | --- |
| Bloom | Four radial gradients, `blur(110px)`, opacity `0.16` | `transform` drift, 61 s |
| Glow | 22 tendril paths, 2.5–6.5 px, `blur(13px)`, `screen` | `transform` drift, 88 s |
| Core | Same 22 paths, 0.7–1.8 px, `plus-lighter` | `stroke-dashoffset` flow, 16–50 s |

Plus 26 nodes on the core layer pulsing on independent 4–11 s clocks.

**Each tendril is drawn twice.** A thick blurred copy makes the glow, a thin
bright copy in `plus-lighter` makes the filament. This is what produces a neon
look without a per-element `drop-shadow`.

**The performance rule, which is load-bearing:** blur is applied once to a
whole static layer and is never recomputed. Only `transform` (compositor-only)
and `stroke-dashoffset` (no filter attached) animate. Animating `filter` per
frame, or putting the dash animation inside a blurred layer, forces a re-blur
of the full viewport every frame. Do not restructure the layers in a way that
couples those two.

Geometry comes from a seeded FNV-1a RNG with a fixed seed string, so the field
is identical on every load and in every test snapshot rather than random.

The whole background is inert under `prefers-reduced-motion: reduce`.

### Rejected: a fourth "haze" layer

An earlier pass added wide blurred strokes across the field for depth. Isolating
the layers in the browser showed this was the single biggest cause of the base
reading grey-purple instead of black. Depth comes from the bloom and glow pair.
Do not reintroduce it.

### Legibility

At 22 tendrils the neon cuts straight through body text. The profile list and
search therefore sit on glass — `background: var(--surface)` with
`backdrop-filter: blur(20px) saturate(1.1)`. The field stays visible through
and around the panel without competing with it. This is not decorative; it is
the reason the density is usable.

## 3. Profile Card Art

A new module, `src/utils/profileArt.ts`, exports a pure function from a handle
to an SVG string. Same handle always yields the same art.

- Seeded FNV-1a hash of the handle drives all geometry.
- Six bezier filaments plus nodes over a near-black base, drawn twice for the
  same glow-and-core treatment as the background.
- Stroke colours are drawn only from `--neon-1` … `--neon-4`, so generated art
  can never introduce a colour outside the theme. An earlier pass let hue float
  freely and produced green and orange rows in an otherwise pink page.
- A `compact` variant renders three thicker lines into a square viewBox. The
  full 300×400 art sliced down to a 36 px row avatar reads as an empty smudge;
  the compact form is the fix, not a nice-to-have.

This is the **default** art every profile gets. The existing upload slot stays —
an owner who uploads their own image still overrides it. Story covers are a
separate concern and are not touched.

The five bundled profile covers in `src/assets/story-card-backgrounds/` become
unreferenced, along with `PROFILE_COVERS` in `LandingPage.tsx`. Removing the
landing background in section 1 also orphans `landing-minimal-sky`.

**Retained, not deleted (amended 2026-07-27).** Both PNG originals and WebP
downscales move to `fixtures/sample-images/`, out of any path Vite can bundle
but still tracked in git. They are wanted as sample material for exercising the
upload pipeline — cropping, resizing, rendition selection — where a 2–3 MB
original and a 40–180 KB optimized file test different paths.

Nothing needs removing from the server or R2: these are build-time `import`
statements, never uploads, so they have no `images` row and no R2 object. The
dev database confirms it — `images` has zero rows and nothing references an
image.

The two story covers under `story-covers/` and `coffee-shop-background` stay in
`src/assets`; both are still in use.

## 4. Identity Model

### Handle only

`phil's stories @phil` becomes `@phil` on the deck card, the list row, and the
profile header. The `displayName` field disappears from every rendered surface
and from the registration form.

The `display_name` column **stays** in the database, auto-filled from the
username at registration. Dropping it means touching the session payload, the
auth API, `publicUser`, and the tests that assert on it — a separate chore with
its own risk, not something to bundle into a theme pass. It becomes invisible
and unused. Removing it properly is tracked as follow-up below.

### Description

New `bio` column: `text`, nullable, with a
`char_length(bio) <= 160` check constraint. This matches how the table already
constrains `display_name` and `username` rather than introducing `varchar`,
which the schema does not use anywhere.

- Deck card: up to two lines under the handle.
- List row: one line, truncated with ellipsis.
- Profile header: full text.

160 characters is enough for a real one-liner and short enough that the list
stays scannable, which is the point of the list.

Migration `server/db/migrations/007_user_bio.sql`. It threads through
`storyStore` (select and patch), `validation.ts` (`userPatchSchema`),
`storyApi.ts`, and the `PlatformProfile` type.

### Demo accounts

The four filler profiles become explicitly synthetic:

| Was | Becomes | Bio |
| --- | --- | --- |
| `neon sleepover` `@neon` | `@demo-01` | generated account, one placeholder story |
| `orbit threads` `@orbit` | `@demo-02` | generated account, one placeholder story |
| `motel lobby` `@motel` | `@demo-03` | generated account, one placeholder story |
| `void pop` `@void` | `@demo-04` | generated account, one placeholder story |

Each keeps exactly one single-scene story, as today. The bios deliberately make
no claim about story counts or presentation modes — an earlier draft gave one of
them "one battle story", which is false, since `story-phil-battle` belongs to
`user-phil`. A bio that describes content will rot the moment the content moves.

Their ids also change (`user-neon` → `user-demo-01`) so nothing internal keeps
the old naming.

**Consequence, accepted:** the seed's prune step deletes credential-free owners
absent from the fixture, so the four old placeholder stories — `Last seen
typing`, `Soft launch`, `Room 12`, `Read receipts`, one scene each — are
deleted and equivalents recreated under the new ids. No authored content is at
risk. `user-phil` is unchanged and both of its stories are untouched.

### Accounts and credentials

Recorded because it caused real confusion: `user-phil` is a seeded, content-only
profile with `password_hash = NULL`. It is not a login. Passwords are scrypt
hashed with a per-user random salt, so none can be recovered — only reset.

Owner access for testing comes from `npm run db:bootstrap-admin`, which creates
a **separate** `user-admin` with the admin role. Admins can edit any story,
including phil's. Passwords must be 12–128 characters and outside the blocklist
in `storyStore.ts`.

That a person cannot hold the profile that represents them is a genuine gap. It
is out of scope here and listed as follow-up.

## 5. Layout

**Search** moves out of the top bar into the gap between the deck and the list,
where it reads as a filter over the thing it filters. The top bar loses the
field and the `isHomeBrowsing` height switch that existed to accommodate it.
Search behaviour is unchanged: a query hides the deck and filters the list.

**The account panel.** The trigger sits in the left rail, but the panel renders
inside the top-right cluster at `AppShell.tsx:159` with `absolute right-0
top-14`, so it always opens away from the control that summoned it. The fix is
to move the account trigger into the top-right cluster so the button and its
panel are the same element group. Adding positioning logic to keep a left-rail
button tethered to a right-side panel would be solving the wrong problem.

**The deck** keeps its current mechanics unchanged — `getDeckOffset`,
`getDeckCardStyle`, the circular wrap, `MAX_VISIBLE_OFFSET`, the inline
`min(18rem, 62vw)` width, the explicit transition property list, and the
autoplay pause rules. Only the card's contents and colours change. The existing
`CLAUDE.md` warning against `transition-all` on these cards still applies.

## 6. Testing

- `profileArt` is a pure function: assert determinism (same handle, same
  output), that every emitted stroke colour is one of the four neon tokens, and
  that `compact` emits the square viewBox.
- Landing page: assert the handle renders without a title, that the bio shows
  in card and row, and that search still filters the list and hides the deck.
- Migration `007` gets the same coverage as its predecessors in
  `migrations.test.ts`.
- Store and API: `bio` round-trips through patch and read, and is rejected over
  160 characters.
- Update `App.test.tsx` fixtures, which currently assert on `displayName`.
- Repository hygiene test should fail if the deleted profile cover assets are
  still imported.
- Browser-check at 390×844 and 1280×720 per `CLAUDE.md`, confirming the mobile
  bottom nav does not cover the list and that text stays legible over the neon.

## Follow-up, explicitly not in this change

1. Drop the `display_name` column and remove it from the session payload.
2. Let a real account claim a seeded showcase profile, so `@phil` can be both a
   profile and a login.
3. Decide whether the phone player and editors adopt the neon theme or stay
   light. They are untouched here, so the app currently has two looks.
