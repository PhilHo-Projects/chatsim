# Story Project Timeline

## 2026-06-01 - Pinterest-Style Browsing Shell

The app moved from a centered landing/selection screen into a persistent browsing shell inspired by Pinterest's layout patterns while keeping the `chatsim` identity. The current shell opens directly into a logged-in-feeling public browsing view with a desktop left rail, mobile bottom navigation, top search/action bar, profile masonry cards, profile-level story bento cards, and the existing phone player embedded inside the same navigation frame.

Seed data expanded from a few hand-made profiles to a fuller test set: 20 dummy public accounts, each with password `0000`, a simple placeholder story, and a local SVG cover under `src/assets/story-card-backgrounds/placeholders/`. Those placeholder covers are intentionally plain, light, geometric assets so the masonry layout can be judged without spending effort on final art.

The visual direction is now clearer: public profiles and stories should feel browsable first, with auth staying quiet in account/settings rather than becoming a marketing wall. Story controls and owner/admin editing stay available only where allowed. The search bar is beginning as a local reordering tool for the current view, so matching profiles or stories rise to the top without hiding the rest of the board.

Open questions for later:
- Whether story formats should expand beyond the phone player into pixel scenes, battle-dialog layouts, or other narrative presentation modes.
- How profile/story metadata should represent themes once search and discovery become more meaningful.
- Whether the dummy placeholder SVG style should become a reusable visual system for generated/default covers.
