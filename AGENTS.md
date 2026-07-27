# Story Project Notes

Compact handoff for future agents working in this repo.

## What This Is
- Vite + React + TypeScript + Tailwind app for scripted texting stories.
- Current experience: a browsing shell with an auto-advancing featured profile deck over a plain profile list, a glassy phone chat player, and a full-screen settings/script editor for owners/admins.
- A small Node HTTP API is mounted into the Vite dev server and also runnable separately for local story/profile/auth persistence.
- Keep the proper app structure. Do not collapse this into one HTML file.

## Commands
- Dev server: `npm run dev -- --port 5174`
- Standalone API server: `npm run dev:api` (defaults to `127.0.0.1:8787`)
- Start the local Postgres service: `npm run dev:db`
- Apply migrations and the canonical showcase seed: `npm run db:migrate && npm run db:seed`
- Stop the local Postgres service: `npm run dev:db:down`
- Tests: `npm test`
- Production build: `npm run build`
- User usually previews: `http://127.0.0.1:5174/`

## Routes
- `/`: featured profile deck plus the full profile list.
- `/profiles/:profileId`: selected profile story grid.
- `/stories/:storyId`: phone story player.

## Scene Memory / Script Data
- Canonical public fixture: `src/data/platformSeed.json`.
- `src/data/platformSeed.ts` normalizes the same fixture for browser fallback data.
- API persistence is Postgres-only. Migrations live under `server/db/migrations/` and are applied automatically on API startup.
- `npm run db:seed` is idempotent. Showcase identities are content-only owners and cannot log in.
- Seeding also PRUNES: credential-free owners no longer in the fixture, and their stories
  and images, are deleted. Accounts with a password hash or an auth provider are never
  pruned. This is how the 20 `user-dummy-*` demo profiles were retired on 2026-07-27.
- Future public seed scripts should be implemented in the canonical fixture, not duplicated in TypeScript.
- Browser editor changes now persist through the local API when signed in as the owner/admin.
- Older conversation localStorage helpers remain for compatibility and tests, but they are not the API's persistence boundary.
- localStorage key: `story.conversationConfig.v3`

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
- `src/components/LandingPage.tsx`: featured profile deck, profile list, and profile story grid.
- `src/components/AccountPanel.tsx`, `StorybookMenu.tsx`: auth and owner/admin story management UI.
- `src/navigation/appRoute.ts`: tiny URL route parser/formatter.
- `src/api/storyApi.ts`: frontend API client.
- `server/api.ts`, `server/storyStore.ts`: API routes and asynchronous Postgres store.
- `server/db/`: ordered SQL migrations, advisory-lock migration runner, and database CLI.
- `server/mediaService.ts`, `server/objectStorage.ts`: image validation/processing and R2 adapter.
- `src/data/conversationConfig.ts`: types, defaults, normalizer, localStorage load/save, speed presets.
- `src/data/platformSeed.json`: canonical public profiles/stories fixture.
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
- There is no client-side editor password or editor-unlock localStorage key.
- Editor visibility comes from `GET /api/stories/:id/permissions`.
- Every story mutation independently enforces owner/admin authorization in the API.

## Greenfield Production
- The new root-path app is `https://chatsim.philippeho.dev`, Coolify application UUID `q11urabk74uu6o0l09i7hrqa`.
- Its dedicated private Postgres 16 resource UUID is `g149qxoyrc0jbtnuzn52dqwm`, limited to 512 MiB with persistent storage.
- The app currently tracks `codex/backend-data-infra` while draft PR #1 is reviewed. Direct Coolify auto-deploy is disabled by using manual releases.
- Daily full database backups run at `0 2 * * *` to the private `philippeho-coolify-db-backups` R2 bucket. A post-seed backup restore has been verified.
- The legacy `/chatsim` stack was retired on 2026-07-27. `philippeho.dev/chatsim*` now 301s
  to `https://chatsim.philippeho.dev`, preserving path suffix and query string, via
  `/data/coolify/proxy/dynamic/chatsim.yaml` (a redirect-only Traefik route, no service).
  The old compose stack, container, image, frozen source copy, and JSON store are gone;
  archived with checksums at `/root/archive/chatsim-legacy-2026-07-27/` on Hetzner.
- R2 application buckets and `media.chatsim.philippeho.dev` are specified but not provisioned yet because a Cloudflare setup credential is not available locally.
- Full deployment and rollback details are in `docs/deployment.md`.

## Landing Page
- The explore view is `FeaturedDeck` (a coverflow of up to `MAX_FEATURED_PROFILES`
  profiles) above a plain, image-free profile list. The list is the directory; the
  deck is a highlight reel.
- Deck cards are absolutely positioned and placed by signed offset from the active
  index (`getDeckOffset` wraps circularly, `getDeckCardStyle` maps offset to
  translate/scale/rotateY/blur/opacity). Cards past `MAX_VISIBLE_OFFSET` are not painted.
- Card width is an inline `min(18rem, 62vw)`, not a breakpoint class, so the deck
  scales continuously instead of jumping at 640px.
- The card transition lists `transform, opacity, filter` explicitly. Do not switch it
  back to `transition-all`: that animates `width` on every viewport change, which makes
  measured widths wrong mid-resize, and animates `filter` on every autoplay step.
- Autoplay pauses on hover and focus and is disabled under `prefers-reduced-motion`.
- Searching hides the deck and filters the list only.

## Style / UX Notes
- Keep the glassmorphism coffee-shop background direction.
- Phone proportions are intentionally narrow/mobile-like.
- Replay/NXT controls live outside the phone and must stay visible above the mobile bottom nav.
- Script editor is full-screen; line cards can fold and show `SpeakerInitial: preview text`.
- When touching story/player layout, browser-check both `390x844` mobile and `1280x720` desktop for clipped or covered controls.

## Testing Expectations
- Run `npm run dev:db`, then `npm test` and `npm run build` after code changes.
- For UI changes, browser-check the local app and inspect console warnings/errors.
- Backend tests use a real Postgres database and cover migrations, store/API behavior, auth/session rules, rate limits, and fake-object-storage media processing.
- Existing frontend tests cover config normalization, timeline behavior, long-bubble wrapping, editor basics, folded lines, shell routing, API-backed story management, and repository hygiene.
