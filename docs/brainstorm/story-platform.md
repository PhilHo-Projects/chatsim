# Story Platform Brainstorm

Date: 2026-05-14

## Current Seed

The project is currently a Vite, React, TypeScript, and Tailwind app that plays a scripted texting conversation inside a phone UI. The useful core is the storyboard data model: scenes, profiles, messages, typing speed levels, pause timing, avatars, and playback state.

That core can grow from a joke app into a creator tool for scripted conversations, interactive roleplay, social practice, and shareable "this is how it should have gone" texting scenes.

## Product Shape

The strongest direction is two related modes:

1. Scripted Story Mode
   - Authors create exact texting scenes.
   - Each scene is deterministic and previewable.
   - The final output is a shareable animated conversation.
   - Use cases include jokes, rewritten arguments, dating app simulations, apologies, fictional scenes, and social practice.

2. Live Character Mode
   - After a scripted scene or set of scenes, the viewer can text back.
   - An LLM responds as one of the characters.
   - The LLM uses the story premise, character profile, scene summaries, and recent messages.
   - Responses are returned as structured JSON so the existing animation engine can play them naturally.

## Scripted Story Mode

This is the first product layer because it is cheaper, simpler, and already close to what exists.

Core creator features:

- Create and edit storyboards.
- Add scenes.
- Set POV/contact names, initials, status, and avatars.
- Add messages with speaker, text, typing speed, pause timing, and default toggles.
- Preview the whole scene as an animation.
- Save public or private stories.
- Share a link that loads the storyboard JSON into the player.
- Duplicate or remix a public story later.

Possible product framing:

- "Make the conversation that should have happened."
- "Rewrite the text thread."
- "Send the scene, not the paragraph."

The passive-aggressive use case is funny, but the same tool can also support sincere, romantic, instructional, fictional, or therapeutic-feeling scenarios.

## Live Character Mode

This should probably come after authored story sharing. The LLM should not free-write arbitrary UI state. It should return the same message shape the app already understands.

Potential response contract:

```json
{
  "messages": [
    {
      "speaker": "viewer",
      "text": "wait, are you actually serious right now?",
      "typingSpeedLevel": 3,
      "pauseAfterMs": 900,
      "useDefaultTypingMs": true,
      "useDefaultPauseAfterMs": false
    }
  ]
}
```

Prompt ingredients:

- Story premise.
- Current scene summary.
- Previous scene summaries.
- Character persona.
- Tone controls.
- Recent message history.
- Hard instruction to output JSON only.

Useful tone controls:

- Absurd
- Flirty
- Awkward
- Sincere
- Hostile
- Deadpan
- Romantic
- Chaotic
- Gentle

The "unhinged" setting should be framed as voice intensity rather than true no-filter behavior. That gives the product a funny range while keeping it controllable and provider-compatible.

## LLM Authoring Assistant

Before public interactive chat, a safer and cheaper stepping stone is creator-only generation.

Possible tools:

- Continue this scene.
- Rewrite this line as funnier.
- Make this reply colder.
- Make this reply kinder.
- Generate scene 2 from scene 1.
- Summarize scene for future LLM context.
- Suggest typing and pause timings.

This lets the app test schema reliability, cost, tone controls, and moderation constraints before exposing live chat to viewers.

## Story Data Model Direction

The current multi-scene JSON can evolve toward:

```ts
type Storyboard = {
  id: string;
  ownerId?: string;
  title: string;
  description?: string;
  visibility: "private" | "unlisted" | "public";
  activeSceneId: string;
  characters: CharacterProfile[];
  scenes: StoryScene[];
  llm?: StoryLlmConfig;
  createdAt: string;
  updatedAt: string;
};
```

Each scene can keep the current conversation config shape, with extra metadata:

```ts
type StoryScene = {
  id: string;
  sceneTitle: string;
  summary?: string;
  messages: ConversationMessage[];
};
```

For LLM chat, each character can get a persona:

```ts
type CharacterProfile = {
  id: string;
  name: string;
  initials: string;
  avatarUrl?: string;
  role: "pov" | "responder" | "other";
  persona?: string;
  voiceTags?: string[];
};
```

## Backend Direction

The low-cost architecture can stay simple:

- Frontend loads a story by ID.
- API fetches storyboard JSON.
- Player hydrates the same animation engine.
- Auth protects create/edit/delete.
- Public/private/unlisted visibility controls sharing.

Possible storage:

- MongoDB for flexible storyboard JSON documents and fast iteration.
- Postgres/Supabase if auth, profiles, search, visibility queries, likes, and remix lineage become important quickly.
- Object storage for avatars and generated images.

Image handling:

- Resize/compress in-browser before upload.
- Prefer WebP where supported.
- Store a small display version for the phone UI.
- Keep original upload optional or skip it entirely.

## Sharing Model

Potential routes:

- `/story/:storyId` for public or unlisted playback.
- `/edit/:storyId` for owner editing.
- `/u/:username` for public profiles later.
- `/story/:storyId/play/:sceneId` if direct scene links become useful.

Visibility:

- Private: only owner.
- Unlisted: anyone with link.
- Public: listed and discoverable.

## Cost Notes

Scripted playback is extremely cheap. The server mostly returns JSON and optimized images.

Cost drivers:

- LLM calls.
- Image storage and bandwidth.
- Auth/database usage if traffic grows.

Mitigations:

- Keep scripted mode available without LLM.
- Put LLM behind creator tools first.
- Cache generated continuations.
- Limit live chat turns per session.
- Compress avatars locally before upload.

## Safety And Abuse Notes

Because the app can simulate conversations with real people, future versions should think about:

- Public story reporting.
- Private/unlisted defaults.
- Clear authorship indicators on shared links.
- No impersonation claims for public stories.
- Limits around harassment, sexual content, and non-consensual personal data.
- Easy delete/unpublish controls.

The app can still be funny and sharp without pretending generated chats are real receipts.

## Roadmap

1. Local creator polish
   - Multi-scene editing.
   - Import/export storyboard JSON.
   - Better scene navigation.
   - Story metadata fields.

2. Shareable JSON prototype
   - Export a storyboard file.
   - Import a storyboard file.
   - Load a local or pasted JSON story into the player.

3. Hosted story links
   - Add backend storage.
   - Add auth.
   - Save public/private/unlisted stories.
   - Render `/story/:storyId`.

4. LLM authoring assistant
   - Continue scene.
   - Rewrite line.
   - Generate scene summary.
   - Return strict JSON only.

5. Live character mode
   - Viewer sends a message.
   - LLM replies as a character.
   - Generated lines are appended and animated.
   - Add turn limits and tone controls.

## Open Questions

- Should the first real expansion be hosted story sharing or LLM-assisted creation?
- Should storyboards support more than two speakers soon, or stay two-person until the product is clearer?
- Should the creator account system be required for saving, or can anonymous unlisted stories exist?
- Should the LLM mode be creator-only at first, or visible to story viewers?
- Should stories be framed as fiction/simulation by default to avoid fake-receipt vibes?

