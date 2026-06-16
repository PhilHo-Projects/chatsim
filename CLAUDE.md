# Story Project Notes

Compact handoff for future agents working in this repo.

## What This Is
- Vite + React + TypeScript + Tailwind app for scripted texting stories.
- Current experience: a Pinterest-style browsing shell with profiles/stories, a glassy phone chat player, and a full-screen settings/script editor for owners/admins.
- A small Node HTTP API is mounted into the Vite dev server and also runnable separately for local story/profile/auth persistence.
- Keep the proper app structure. Do not collapse this into one HTML file.

## Commands
- Dev server: `npm run dev -- --port 5174`
- Standalone API server: `npm run dev:api` (defaults to `127.0.0.1:8787`)
- Tests: `npm test`
- Production build: `npm run build`
- User usually previews: `http://127.0.0.1:5174/`

## Routes
- `/`: public profile masonry.
- `/profiles/:profileId`: selected profile story grid.
- `/stories/:storyId`: phone story player.

## Scene Memory / Script Data
- Canonical crafted Phil story seed: `src/data/storyDatabase.json`.
- Platform profile/story seed helpers: `src/data/platformSeed.ts`.
- Local API store: `server/data/story-store.local.json` by default, ignored by git.
- Override local API store path with `CHATSIM_STORE_FILE`.
- `server/data/story-store.json` is a checked-in legacy/reference snapshot, not the default runtime store.
- Future pasted back-and-forth scripts should usually be implemented by editing this JSON.
- Browser editor changes now persist through the local API when signed in as the owner/admin.
- Older localStorage helpers still exist for compatibility and tests, but the shell hydrates from `/api/profiles`, `/api/auth/session`, and `/api/stories/:storyId`.
- localStorage key: `story.conversationConfig.v3`
- If the browser shows old/user-edited data, clear the ignored local store file or use the editor/API state intentionally.

Message shape:
```ts
{
  id: string;
  speaker: "viewer" | "contact";
  text: string;
  typingSpeedLevel?: 1 | 2 | 3 | 4 | 5;
  pauseAfterMs?: number;
  useDefaultTypingMs?: boolean;
  useDefaultPauseAfterMs?: boolean;
}
```

Important naming:
- `contact` = POV phone owner, right/outgoing bubbles, typed into composer. Default: Maya.
- `viewer` = other speaker, left/incoming bubbles and `"is typing"`. Default: Frank.

## Core Files
- `src/App.tsx`: orchestrates routes, API hydration, story selection, phone UI, story controls, editor.
- `src/components/AppShell.tsx`: persistent desktop/mobile navigation shell.
- `src/components/LandingPage.tsx`: profile masonry and profile story grid.
- `src/components/AccountPanel.tsx`, `StorybookMenu.tsx`: auth and owner/admin story management UI.
- `src/navigation/appRoute.ts`: tiny URL route parser/formatter.
- `src/api/storyApi.ts`: frontend API client.
- `server/api.ts`, `server/storyStore.ts`: local API routes and file-backed story/auth store.
- `src/data/conversationConfig.ts`: types, defaults, normalizer, localStorage load/save, speed presets.
- `src/data/storyDatabase.json`: editable scene/script seed.
- `src/hooks/useScriptedConversation.ts`: animation timeline/state machine (shared by both presentation modes).
- `src/components/ScriptEditor.tsx`: full-screen PHONE editor, foldable line cards, avatar uploads.
- `src/components/BattleStoryPlayer.tsx`: Pokemon-style battle renderer (pixel sprites + static dialogue panels).
- `src/components/BattleScriptEditor.tsx`: minimal full-screen BATTLE editor (trainer names, typing speed, line list).
- `src/components/MessageList.tsx`, `MessageBubble.tsx`, `TypingIndicator.tsx`: chat rendering.
- `src/assets/maya-anime-avatar.png`, `src/assets/mystery-speaker-avatar.png`: default avatars.

## Presentation Modes
- A story's `presentationMode` is `"phone"` or `"battle"` (`src/data/conversationConfig.ts`).
- Phone: `PhoneShell` + `ScriptEditor`; POV types into the composer, the other speaker shows `"is typing"`.
- Battle: `BattleStoryPlayer` + `BattleScriptEditor`; BOTH speakers type their line out character-by-character.
- The typewriter difference is the `typeAllSpeakers` option on `useScriptedConversation` (true only for battle). One parameterized hook is used (not two) to respect React's rules of hooks; the split lives in the render + editor components.
- In battle terms: `viewer` = opponent (top), `contact` = player (bottom).
- Battle sprites are box-shadow pixel grids defined in `BattleStoryPlayer.tsx` (`BATTLE_SPRITE_ROWS`); a test asserts the grids stay rectangular.
- The seeded battle story (`story-phil-battle`) has its own script in BOTH `server/storyStore.ts` (`BATTLE_SCRIPT`) and `src/data/platformSeed.ts` (`battleScript`). It is separate from the phone story; keep the two in sync. `normalizeStoreData` only re-adds missing seed stories, so to refresh battle content in an existing local store, delete that story's entry (or the whole local store file).

## Timing Model
- POV typing speed is proportional to message length.
- `POV_TYPING_SPEED_MS_PER_CHARACTER` maps speed levels 1-5 to ms/character.
- `SPEAKER_TYPING_DURATION_MS` maps speed levels 1-5 to `"is typing"` duration (phone, other speaker only).
- Both arrays live in `src/data/conversationConfig.ts`.
- In battle mode both speakers use the per-character POV model (no `"is typing"` duration).

## Editor / Access
- Gear icon is controlled by `SHOW_SCRIPT_EDITOR` in `conversationConfig.ts`.
- Password is `0000` in production builds.
- Password is disabled in dev via `EDITOR_REQUIRES_PASSWORD = !import.meta.env.DEV`.
- Production unlock is remembered for 24 hours in localStorage.

## Style / UX Notes
- Keep the glassmorphism coffee-shop background direction.
- One GitHub-style palette app-wide: clean white/gray light mode, blue-black `#0d1117` dark mode with a blue accent; dark is the default theme. No warm/brown tints — the user explicitly rejected them.
- Editor surfaces are driven by `--editor-*` tokens in `src/styles/editor.css` (light values + `.dark` overrides, scoped to `.editor-theme`). Re-color editors there, not with hardcoded hexes.
- Fonts: Hanken Grotesk body (`--font-sans`), Fraunces display headings (`--font-display` / `font-display` utility), Silkscreen only for battle pixel art. No other families.
- The in-phone chat UI (white glass, blue outgoing bubbles) is "in-world" and stays light in both themes.
- Phone proportions are intentionally narrow/mobile-like.
- Replay/NXT controls live outside the phone and must stay visible above the mobile bottom nav.
- Script editor is full-screen but offset `md:left-20` so the desktop side nav stays visible and usable; same for the battle editor.
- Script editor line cards can fold and show `SpeakerInitial: preview text`.
- When touching story/player layout, browser-check both `390x844` mobile and `1280x720` desktop for clipped or covered controls.

## Testing Expectations
- Run `npm test` and `npm run build` after code changes.
- For UI changes, browser-check the local app and inspect console warnings/errors.
- Existing tests cover config normalization, timeline behavior, long-bubble wrapping, editor basics, folded lines, shell routing, API-backed story management, repository hygiene, and local store behavior.
