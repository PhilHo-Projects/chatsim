# Warm Latte Editor Refresh — Design

Date: 2026-06-05
Scope: `src/components/ScriptEditor.tsx` (phone editor) and its supporting tokens/utilities.

## Problem

The phone Script Editor works structurally but feels flat: cold blue-on-white panels with
low contrast, the default Inter typeface reads as mechanical/generic, and there is no way to
see the story while editing it. The owner also wants a faster way to get a written back-and-forth
script into the editor instead of adding lines one at a time.

## Goals

1. Give the editor a warm, hand-crafted look ("Warm Latte") that escapes the generic AI-default feel.
2. Reorganize into three clear panels — **Settings**, **Script**, **Live preview** — that collapse
   into a segmented switch on narrow screens.
3. Add a static, always-in-sync preview of the conversation with an on-demand Play animation.
4. Add a "Paste script" import that parses plain text into message lines locally (no LLM), built so an
   LLM can replace the parser later behind the same button.

## Non-Goals (this pass)

- Battle editor (`BattleScriptEditor.tsx`) — untouched; restyle in a later pass.
- Restyling the actual phone player / what viewers see — only the **editor chrome** changes. The preview
  embeds the real player look truthfully.
- Real LLM wiring (no API keys, no server route this pass).
- Changing the app default font or the landing/player surfaces — new fonts are scoped to the editor.

## Design

### 1. Aesthetic & tokens ("Warm Latte")

Introduce the palette as named tokens so the whole look is swappable from one place (the owner may
re-color later). Add to the Tailwind `@theme` block in `src/index.css`:

- `--font-display: Fraunces, ...serif` (headings + uppercase labels)
- `--font-body: "Hanken Grotesk", ...sans` (inputs, field text, chat bubbles)
- Latte color tokens (names indicative): `--color-latte-bg-from/-to`, `--color-latte-panel`,
  `--color-latte-border`, `--color-latte-field`, `--color-latte-espresso` (solid buttons / active chip),
  `--color-latte-caramel` (accent), `--color-latte-ink`, `--color-latte-label`.

Load Fraunces + Hanken Grotesk via the existing Google Fonts `<link>` in `index.html` (same mechanism as
Fredoka/Silkscreen). The Latte styling and `--font-display`/`--font-body` apply **only within the editor's
root container**, not globally.

Approximate values (from the approved mockup; tune freely since tokens are central):
bg `#f3e9da → #e8d7bf`, panel `#fffdf8`, border `#e8d8c0`, field `#fbf4e8`/`#e7d6bd`,
espresso `#3a2417`, caramel `#cf8b46`, label `#b07a3c`, heading `#7a4f24`, ink `#3a2c1c`.

Also: **remove the `"edit your story here"` subtitle** under the "Script editor" title (no decorative
sub-descriptors).

### 2. Three-panel layout

Restructure the editor body (the unlocked branch of `ScriptEditor`) from today's
General-on-top + 2-column grid into three panels:

- **Settings** (left, ~300px): General (story name, choose scene) + Scene & cast (POV/Speaker names,
  initials, statuses, avatars) + Timing defaults. Each remains foldable as today.
- **Script** (middle, flexible): the line-card list, the line counter/progress, "Add line", and the new
  "Paste script" button. Per-line timing collapses to a compact `type · pause` summary row that expands
  to the existing full controls (keeps the column scannable). Existing `data-testid` hooks
  (`line-N-speaker-row`, `line-N-text-row`, `line-N-text-tools`) are preserved.
- **Live preview** (right, ~340px): see §3.

Responsive behavior:

- Wide (`xl`): three columns side-by-side (`grid-template-columns: ~300px minmax(0,1fr) ~340px`).
- Below `xl`: a segmented switch at the top (`Settings · Script · Preview`) renders one full-width panel
  at a time. A small piece of `activePanel` state (`"settings" | "script" | "preview"`) drives this; on wide
  screens the switch is hidden and all three render. This replaces today's stacked single-column flow.

### 3. Live preview (static snapshot + Play)

- Default: render the **whole conversation as a finished transcript** — all bubbles visible, scrollable,
  no animation — by reusing the existing presentational components (`MessageList` / `MessageBubble`,
  inside a lightweight reuse of `PhoneShell` chrome). It reads straight from `config`, so it stays in sync
  on every edit with no animation cost.
- A **Play** button mounts the real animated player path (`useScriptedConversation`) to run the timeline
  once on demand; when it finishes (or is dismissed) it returns to the static snapshot.
- The preview shows the genuine player styling, not Latte-recolored bubbles.

Component boundary: extract a `ConversationPreview` component that takes `config` + a `mode`
(`"static" | "play"`) so the editor stays focused and the preview is independently testable.

### 4. Paste-to-script import (local, no LLM)

- A **"Paste script"** button in the Script panel opens a modal containing a textarea, a short hint, a
  Cancel, and an "Add N lines" confirm (N updates live as the text is parsed). Choice to **append** vs
  **replace** the current scene's lines (default append; replace asks for confirm).
- Parsing lives in a pure, unit-tested module `src/utils/scriptImport.ts`:

  ```ts
  parseScriptText(
    text: string,
    opts: { contactName: string; viewerName: string }
  ): ConversationMessage[]
  ```

  Rules (v1, deterministic):
  - Split into lines; ignore blank lines as separators.
  - A line of the form `Label: text` sets the speaker from `Label` (case-insensitive):
    `me` / the POV/`contactName` → `contact`; `you` / the `viewerName` → `viewer`; any other first-seen
    label binds to `contact`, the next distinct label binds to `viewer` (max two speakers; further labels
    map by closest match).
  - A line **without** a leading `Label:` is appended to the previous message (newline-joined); if there is
    no previous message it starts one attributed to `contact`.
  - Each produced message uses defaults (`useDefaultTypingMs`/`useDefaultPauseAfterMs` true) and a fresh id
    via the existing message factory so normalization stays consistent.
  - Respect `SCENE_MESSAGE_MAX_COUNT` (truncate + surface a notice when the paste would exceed it).
- The LLM is a future drop-in behind the same button and the same `parseScriptText` signature — no UI or
  data-shape change required to add it later.

### 5. Testing

- TDD the parser: `scriptImport.test.ts` covering `me:/you:`, named speakers, unknown labels, continuation
  lines, blank-line handling, and the scene cap.
- Component tests: segmented-switch panel toggling on narrow widths; preview renders all messages in static
  mode; "Paste script" modal adds the expected number of lines (append + replace).
- Keep existing editor tests green (preserve `data-testid`s; update only where structure genuinely moved).
- Run `npm test` and `npm run build`; browser-check `390x844` and `1280x720` for clipped/covered controls,
  per project UX notes.

## Risks / Notes

- Parallel work: Codex is adding images concurrently. Keep edits confined to the editor, tokens, the new
  preview/import modules, and their tests to minimize collision.
- The compacted per-line timing row must keep the existing controls reachable (one tap to expand) so no
  timing capability is lost.
- Token-first styling means a later re-color is a single-file change, satisfying the owner's "might change
  the color" caveat.
