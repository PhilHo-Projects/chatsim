import {
  normalizeStoryboard,
  type Storyboard
} from "../data/conversationConfig";
import type {
  ImageReference,
  PlatformProfile,
  PlatformSession,
  PlatformStoryRecord
} from "../data/platformSeed";

type ApiStoryRecord = Omit<PlatformStoryRecord, "storyboard"> & {
  storyboard: Storyboard;
};

export type StoryFeedCard = {
  author: {
    avatarImage: ImageReference | null;
    displayName: string;
    id: string;
    username: string;
  };
  coverFallbackColor: string;
  coverImage: ImageReference | null;
  id: string;
  presentationMode: "phone" | "battle";
  sceneCount: number;
  title: string;
  updatedAt: string;
};

export type UploadedImage = {
  height: number | null;
  id: string;
  kind: "avatar" | "profile" | "story_cover" | "scene_art" | "sprite";
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  sizeBytes: number;
  status:
    | "pending"
    | "processing"
    | "ready"
    | "rejected"
    | "deleting"
    | "deleted";
  variants: ImageReference["variants"] | null;
  width: number | null;
};

const DEFAULT_BASE_PATH = import.meta.env.BASE_URL ?? "/";

function normalizeBasePath(basePath: string) {
  if (!basePath || basePath === "/") {
    return "/";
  }

  const withLeadingSlash = basePath.startsWith("/") ? basePath : `/${basePath}`;

  return withLeadingSlash.endsWith("/")
    ? withLeadingSlash
    : `${withLeadingSlash}/`;
}

export function getApiPath(path: string, basePath = DEFAULT_BASE_PATH) {
  const normalizedBasePath = normalizeBasePath(basePath);

  if (normalizedBasePath === "/") {
    return path;
  }

  return `${normalizedBasePath.slice(0, -1)}${path}`;
}

async function requestJson<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(getApiPath(path), {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });
  const payload = (await response.json()) as T & { error?: string };

  if (!response.ok) {
    throw new Error(payload.error ?? "Request failed.");
  }

  return payload;
}

function normalizePlatformStory(story: ApiStoryRecord): PlatformStoryRecord {
  return {
    ...story,
    storyboard: normalizeStoryboard({
      ...story.storyboard,
      id: story.id,
      title: story.title
    })
  };
}

export async function fetchProfiles() {
  const payload = await requestJson<{ profiles: PlatformProfile[] }>(
    "/api/profiles"
  );

  return payload.profiles;
}

export async function fetchSession() {
  const payload = await requestJson<{ session: PlatformSession | null }>(
    "/api/auth/session"
  );

  return payload.session;
}

export async function fetchStory(storyId: string) {
  const payload = await requestJson<{ story: ApiStoryRecord }>(
    `/api/stories/${encodeURIComponent(storyId)}`
  );

  return normalizePlatformStory(payload.story);
}

function prepareStoryWrite(input: Partial<PlatformStoryRecord>) {
  const copy = JSON.parse(
    JSON.stringify({
      coverColor: input.coverColor,
      coverImageId: input.coverImageId,
      storyboard: input.storyboard,
      title: input.title,
      visibility: input.visibility
    })
  ) as Partial<PlatformStoryRecord>;

  const scrub = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(scrub);
      return;
    }

    if (!value || typeof value !== "object") {
      return;
    }

    const record = value as Record<string, unknown>;

    if ("avatarUrl" in record) {
      record.avatarUrl = "";
    }

    delete record.avatarImage;
    delete record.coverImage;
    Object.values(record).forEach(scrub);
  };

  scrub(copy);
  return copy;
}

export async function fetchStoryFeed(input: {
  cursor?: string;
  limit?: number;
} = {}) {
  const search = new URLSearchParams();

  if (input.cursor) {
    search.set("cursor", input.cursor);
  }

  if (input.limit !== undefined) {
    search.set("limit", String(input.limit));
  }

  const suffix = search.size > 0 ? `?${search.toString()}` : "";
  return requestJson<{
    nextCursor: string | null;
    stories: StoryFeedCard[];
  }>(`/api/feed/stories${suffix}`);
}

export async function fetchStoryPermissions(storyId: string) {
  return requestJson<{ canDelete: boolean; canEdit: boolean }>(
    `/api/stories/${encodeURIComponent(storyId)}/permissions`
  );
}

export async function updateCurrentUser(input: {
  avatarImageId?: string | null;
  bio?: string | null;
  displayName?: string;
}) {
  return requestJson<{ user: PlatformSession["user"] }>("/api/users/me", {
    body: JSON.stringify(input),
    method: "PATCH"
  });
}

export async function createImageUpload(input: {
  kind: UploadedImage["kind"];
  mimeType: UploadedImage["mimeType"];
  sizeBytes: number;
}) {
  return requestJson<{
    image: UploadedImage;
    upload: {
      expiresAt: string;
      headers: Record<string, string>;
      method: "PUT";
      url: string;
    };
  }>("/api/uploads", {
    body: JSON.stringify(input),
    method: "POST"
  });
}

export async function completeImageUpload(imageId: string) {
  return requestJson<{ image: UploadedImage }>(
    `/api/uploads/${encodeURIComponent(imageId)}/complete`,
    {
      body: "{}",
      method: "POST"
    }
  );
}

export async function deleteImage(imageId: string) {
  await requestJson<{ ok: true }>(
    `/api/images/${encodeURIComponent(imageId)}`,
    { method: "DELETE" }
  );
}

export async function login(input: { password: string; username: string }) {
  const payload = await requestJson<{ session: PlatformSession }>(
    "/api/auth/login",
    {
      body: JSON.stringify(input),
      method: "POST"
    }
  );

  return payload.session;
}

export async function register(input: {
  password: string;
  username: string;
}) {
  const payload = await requestJson<{ session: PlatformSession }>(
    "/api/auth/register",
    {
      body: JSON.stringify(input),
      method: "POST"
    }
  );

  return payload.session;
}

export async function logout() {
  await requestJson<{ ok: true }>("/api/auth/logout", { method: "POST" });
}

export async function createStory(input: Partial<PlatformStoryRecord> = {}) {
  const payload = await requestJson<{ story: ApiStoryRecord }>("/api/stories", {
    body: JSON.stringify(prepareStoryWrite(input)),
    method: "POST"
  });

  return normalizePlatformStory(payload.story);
}

export async function updateStory(
  storyId: string,
  input: Partial<PlatformStoryRecord>
) {
  const payload = await requestJson<{ story: ApiStoryRecord }>(
    `/api/stories/${encodeURIComponent(storyId)}`,
    {
      body: JSON.stringify(prepareStoryWrite(input)),
      method: "PUT"
    }
  );

  return normalizePlatformStory(payload.story);
}

export async function deleteStory(storyId: string) {
  await requestJson<{ ok: true }>(`/api/stories/${encodeURIComponent(storyId)}`, {
    method: "DELETE"
  });
}
