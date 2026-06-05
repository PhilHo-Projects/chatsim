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
- `src/hooks/useScriptedConversation.ts`: animation timeline/state machine.
- `src/components/ScriptEditor.tsx`: full-screen editor, foldable line cards, avatar uploads.
- `src/components/MessageList.tsx`, `MessageBubble.tsx`, `TypingIndicator.tsx`: chat rendering.
- `src/assets/maya-anime-avatar.png`, `src/assets/mystery-speaker-avatar.png`: default avatars.

## Timing Model
- POV typing speed is proportional to message length.
- `POV_TYPING_SPEED_MS_PER_CHARACTER` maps speed levels 1-5 to ms/character.
- `SPEAKER_TYPING_DURATION_MS` maps speed levels 1-5 to `"is typing"` duration.
- Both arrays live in `src/data/conversationConfig.ts`.

## Editor / Access
- Gear icon is controlled by `SHOW_SCRIPT_EDITOR` in `conversationConfig.ts`.
- Password is `0000` in production builds.
- Password is disabled in dev via `EDITOR_REQUIRES_PASSWORD = !import.meta.env.DEV`.
- Production unlock is remembered for 24 hours in localStorage.

## Style / UX Notes
- Keep the glassmorphism coffee-shop background direction.
- Phone proportions are intentionally narrow/mobile-like.
- Replay/NXT controls live outside the phone and must stay visible above the mobile bottom nav.
- Script editor is full-screen; line cards can fold and show `SpeakerInitial: preview text`.
- When touching story/player layout, browser-check both `390x844` mobile and `1280x720` desktop for clipped or covered controls.

## Testing Expectations
- Run `npm test` and `npm run build` after code changes.
- For UI changes, browser-check the local app and inspect console warnings/errors.
- Existing tests cover config normalization, timeline behavior, long-bubble wrapping, editor basics, folded lines, shell routing, API-backed story management, repository hygiene, and local store behavior.
