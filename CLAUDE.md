# Story Project Notes

Compact handoff for future agents working in this repo.

## What This Is
- Vite + React + TypeScript + Tailwind app for a scripted texting animation.
- Main experience: a glassy phone chat UI, autoplaying a scripted conversation, with a full-screen settings/script editor.
- Keep the proper app structure. Do not collapse this into one HTML file.

## Commands
- Dev server: `npm run dev -- --port 5174`
- Tests: `npm test`
- Production build: `npm run build`
- User usually previews: `http://127.0.0.1:5174/`

## Scene Memory / Script Data
- Main seed database: `src/data/storyDatabase.json`
- Future pasted back-and-forth scripts should usually be implemented by editing this JSON.
- Browser editor changes are saved to localStorage, not automatically baked into the JSON.
- localStorage key: `story.conversationConfig.v3`
- If the browser shows old/user-edited data, clear that key or update through the editor.

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
- `src/App.tsx`: wires config, animation hook, phone UI, story controls, editor.
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
- Replay/NXT controls live outside the phone.
- Script editor is full-screen; line cards can fold and show `SpeakerInitial: preview text`.

## Testing Expectations
- Run `npm test` and `npm run build` after code changes.
- For UI changes, browser-check the local app and inspect console warnings/errors.
- Existing tests cover config normalization, timeline behavior, long-bubble wrapping, editor basics, and folded lines.
