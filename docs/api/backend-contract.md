# Chatsim Backend API Contract

Status: implementation contract for `codex/backend-data-infra`

This document is the coordination boundary between the backend migration and
the parallel story-first UI work. The API is same-origin under `/api`.

## Shared Types

```ts
type PresentationMode = "phone" | "battle";
type ImageKind =
  | "avatar"
  | "profile"
  | "story_cover"
  | "scene_art"
  | "sprite";

type ImageVariants = {
  thumb: string;
  card: string;
  full: string;
};

type ImageReference = {
  id: string;
  variants: ImageVariants;
};

type PublicUser = {
  id: string;
  username: string;
  displayName: string;
  role: "admin" | "member";
};

type Session = {
  user: PublicUser;
  expiresAt: string;
};
```

Image variant values are public display URLs. The API never returns private R2
object keys, original URLs, data URLs, or session bearer tokens.

Legacy storyboard `avatarUrl` fields remain present as empty strings during the
frontend transition. Uploaded speaker images use `avatarImageId` on writes and
`avatarImage` on reads.

## Errors

Non-2xx JSON responses have this shape:

```ts
type ApiError = {
  error: string;
  code:
    | "BAD_REQUEST"
    | "UNAUTHENTICATED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "PAYLOAD_TOO_LARGE"
    | "UNSUPPORTED_MEDIA_TYPE"
    | "MEDIA_REJECTED"
    | "RATE_LIMITED"
    | "SERVICE_UNAVAILABLE"
    | "INTERNAL_ERROR";
};
```

Rate-limited responses include `Retry-After`.
Media routes return `503 SERVICE_UNAVAILABLE` without configuration details
when the R2 service cannot initialize.

## Health

### `GET /api/health`

```json
{
  "status": "ok",
  "database": "ok"
}
```

Returns `503` when Postgres or the migration state is unavailable. R2 is not a
health dependency.

## Story-first Feed

### `GET /api/feed/stories?limit=&cursor=`

- `limit` defaults to `24`, with a maximum of `50`.
- Only public stories are returned.
- Ordering is `updated_at DESC, id DESC`.
- `cursor` is an opaque base64url value. Callers must not construct it.
- A malformed cursor returns `400`.

```ts
type StoryFeedResponse = {
  stories: Array<{
    id: string;
    title: string;
    sceneCount: number;
    presentationMode: PresentationMode;
    coverImage: ImageReference | null;
    coverFallbackColor: string;
    updatedAt: string;
    author: {
      id: string;
      username: string;
      displayName: string;
      avatarImage: ImageReference | null;
    };
  }>;
  nextCursor: string | null;
};
```

## Existing Browsing and Story Routes

### `GET /api/profiles`

The existing `{profiles}` wrapper and existing fields remain. Additions are:

- Profile: `avatarImage: ImageReference | null`.
- Story card: `coverImage: ImageReference | null`.
- Story card: `presentationMode: PresentationMode`.

The legacy story-card `coverColor` field remains.

### `GET /api/stories/:id`

The existing `{story}` wrapper remains. Additions are:

- `story.coverImage: ImageReference | null`.
- Each storyboard speaker can contain
  `avatarImage: ImageReference | null`.
- `avatarImageId` can remain present as a stable stored reference.
- Legacy `avatarUrl` values returned by the backend are always `""`.

Public stories are readable anonymously. A private story is readable by its
owner or an admin.

### `GET /api/stories/:id/permissions`

```ts
type StoryPermissionsResponse = {
  canEdit: boolean;
  canDelete: boolean;
};
```

Anonymous callers receive both values as `false`. These flags are for UI
gating only; mutation routes enforce authorization independently.

### `POST /api/stories`

Existing fields remain accepted. New optional fields:

```ts
{
  coverImageId?: string | null;
  storyboard?: {
    scenes: Array<{
      contact?: { avatarImageId?: string | null };
      viewer?: { avatarImageId?: string | null };
    }>;
  };
}
```

Referenced images must be ready, owned by the caller, and have a compatible
kind.

### `PUT /api/stories/:id`

Uses the same additions and validations as story creation. Owners can modify
their stories; admins can modify any story.

### `DELETE /api/stories/:id`

Unchanged response:

```json
{ "ok": true }
```

## Auth

### `GET /api/auth/session`

```ts
type SessionResponse = {
  session: Session | null;
};
```

The opaque token exists only in the `HttpOnly` cookie.

### `POST /api/auth/register`

```ts
type RegisterRequest = {
  username: string;
  displayName: string;
  password: string;
};

type RegisterResponse = {
  session: Session;
};
```

Passwords must be 12-128 characters and must not be a known weak password.

### `POST /api/auth/login`

```ts
type LoginRequest = {
  username: string;
  password: string;
};

type LoginResponse = {
  session: Session;
};
```

Invalid credentials use one generic error. Login and registration can return
`429` with `Retry-After`.

### `POST /api/auth/logout`

```json
{ "ok": true }
```

### `PATCH /api/users/me`

```ts
type UpdateCurrentUserRequest = {
  displayName?: string;
  avatarImageId?: string | null;
};

type UpdateCurrentUserResponse = {
  user: PublicUser & {
    avatarImage: ImageReference | null;
  };
};
```

The avatar must be a ready, caller-owned `profile` image.

## Uploads and Images

Uploads require a valid session.
The start, completion, and deletion routes may return
`503 SERVICE_UNAVAILABLE` while media storage is unavailable.

### `POST /api/uploads`

```ts
type StartUploadRequest = {
  kind: ImageKind;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  sizeBytes: number;
};

type StartUploadResponse = {
  image: {
    id: string;
    kind: ImageKind;
    status: "pending";
  };
  upload: {
    method: "PUT";
    url: string;
    headers: {
      "Content-Type": string;
    };
    expiresAt: string;
  };
};
```

The client uploads the exact file bytes directly to `upload.url` with the
returned headers. The URL expires after five minutes. The signature binds both
the returned `Content-Type` and the claimed content length; browsers supply the
matching `Content-Length` for the exact request body. Claimed size must be at
most 10 MiB; actual size and content are verified during completion.

Each user may reserve at most 30 uploads per hour and may hold at most 10
unfinished uploads totaling 50 MiB. A rate or quota limit returns `429` with
`Retry-After`.

### `POST /api/uploads/:id/complete`

The request body is optional and ignored.

```ts
type CompleteUploadResponse = {
  image: {
    id: string;
    kind: ImageKind;
    status: "ready";
    mimeType: "image/jpeg" | "image/png" | "image/webp";
    width: number;
    height: number;
    sizeBytes: number;
    variants: ImageVariants;
  };
};
```

Completion is idempotent. Repeating completion for a ready image returns the
same response. Invalid content is marked rejected and returns an appropriate
4xx response. Processing concurrency is capped per application instance, and
stale unfinished uploads are reclaimed automatically.

### `DELETE /api/images/:id`

The owner or an admin may delete an image.

```json
{ "ok": true }
```

The API removes the private original and public variants before marking the
metadata row deleted.

## Compatibility Notes for the Parallel UI

- Continue using existing profile/story endpoints until the story-first feed is
  wired.
- Do not read `PlatformSession.token`; it is removed.
- Use `coverImage?.variants.card` for feed cards.
- Use `author.avatarImage?.variants.thumb` for feed/profile avatars.
- Use `avatarImage?.variants.thumb` for chat bubbles and
  `avatarImage?.variants.full` for enlarged previews.
- Use `/api/stories/:id/permissions` for editor visibility.
- Upload UI must perform start -> direct PUT -> complete before attaching the
  returned image ID to a user or story.
