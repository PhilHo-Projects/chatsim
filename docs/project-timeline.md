# Story Project Timeline

## 2026-06-03 - Media Storage And Auth Brainstorm

Image upload planning now has a living note at `docs/brainstorm/media-storage-auth.md`. The current direction is to keep dialogue/story data as JSON or database rows, store uploaded image bytes in Cloudflare R2, use signed/direct uploads, generate compressed variants, and require authenticated users for public-facing uploads. The same note captures the Google/OpenID Connect auth idea, basic upload safety guardrails, and a suggested next-work order for Cloudflare setup, auth, image metadata, and admin moderation.

## 2026-06-03 - Extra Phil Story Seeds

Phil's profile now includes five extra tiny one-scene seed stories (`wyd`, `gm`, `coffee`, `ping`, and `movie`) alongside the original crafted story. These are intentionally lightweight placeholder conversations so the profile story grid can be judged with multiple cards before the real active story is finalized.

## 2026-06-02 - Hygiene Pass Before Deployment Prep

The app got a diagnostic-driven cleanup pass focused on making the current platform direction easier to continue. The story player layout now reserves space for the external controls across mobile and desktop viewports, so Replay/Pause/Speed/NXT no longer sit under the mobile bottom nav or below shorter desktop viewports.

Runtime persistence moved away from the checked-in store snapshot. `StoryStore.open()` now defaults to an ignored local store file, with `CHATSIM_STORE_FILE` available for explicit overrides. The crafted Phil story remains seeded from `src/data/storyDatabase.json`, while the local API store is treated as dev/runtime state.

Repository hygiene also tightened up: generated Vite config outputs were removed, `.playwright-cli/` and local store files are ignored, and tests now cover the expected artifact boundaries. The handoff docs were refreshed to describe the current stack, routes, API-backed data flow, and viewport verification expectations.

## 2026-06-01 - Pinterest-Style Browsing Shell

The app moved from a centered landing/selection screen into a persistent browsing shell inspired by Pinterest's layout patterns while keeping the `chatsim` identity. The current shell opens directly into a logged-in-feeling public browsing view with a desktop left rail, mobile bottom navigation, top search/action bar, profile masonry cards, profile-level story bento cards, and the existing phone player embedded inside the same navigation frame.

Seed data expanded from a few hand-made profiles to a fuller test set: 20 dummy public accounts, each with password `0000`, a simple placeholder story, and a local SVG cover under `src/assets/story-card-backgrounds/placeholders/`. Those placeholder covers are intentionally plain, light, geometric assets so the masonry layout can be judged without spending effort on final art.

The visual direction is now clearer: public profiles and stories should feel browsable first, with auth staying quiet in account/settings rather than becoming a marketing wall. Story controls and owner/admin editing stay available only where allowed. The search bar is beginning as a local reordering tool for the current view, so matching profiles or stories rise to the top without hiding the rest of the board.

Open questions for later:
- Whether story formats should expand beyond the phone player into pixel scenes, battle-dialog layouts, or other narrative presentation modes.
- How profile/story metadata should represent themes once search and discovery become more meaningful.
- Whether the dummy placeholder SVG style should become a reusable visual system for generated/default covers.

## 2026-06-01 - Browser-History Navigation Refactor

Navigation moved from internal view flags to URL-backed top-level routes without adding a full routing library. The current route shapes are `/` for the profile masonry, `/profiles/:profileId` for a profile's story bento grid, and `/stories/:storyId` for the phone player. Browser-style navigation can now preserve the shell while moving home -> profile -> story, and direct links can open profile or story views.

The refactor intentionally kept the phone player, editor, auth, and story data flow mostly unchanged. Story creation now navigates to the new story URL on success, logged-out create still opens the account panel without changing route, and deleting the active story replaces the URL with a fallback story, the owner profile, or home.

`App.tsx` also got a boundary pass: the persistent shell lives in `AppShell`, auth UI lives in `AccountPanel`, and owner/admin storybook controls live in `StorybookMenu`. This should make later work, like shareable storyboards or alternate story formats, less tangled with the navigation chrome.
