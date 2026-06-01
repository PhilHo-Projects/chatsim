import {
  normalizeStoryboard,
  type Storyboard
} from "../data/conversationConfig";
import type {
  PlatformProfile,
  PlatformSession,
  PlatformStoryRecord
} from "../data/platformSeed";

type ApiStoryRecord = Omit<PlatformStoryRecord, "storyboard"> & {
  storyboard: Storyboard;
};

async function requestJson<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(path, {
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
  displayName: string;
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
    body: JSON.stringify(input),
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
      body: JSON.stringify(input),
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
