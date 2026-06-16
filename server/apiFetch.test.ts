// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createFetchApiHandler } from "./apiFetch";
import { createSeedStoreData, StoryStore } from "./storyStore";

function requireResponse(response: Response | null): Response {
  if (!response) {
    throw new Error("Expected API response.");
  }

  return response;
}

describe("createFetchApiHandler", () => {
  it("serves the existing profiles route through the Fetch contract", async () => {
    const store = StoryStore.createMemory(createSeedStoreData());
    const handleRequest = createFetchApiHandler({ store });

    const response = requireResponse(
      await handleRequest(new Request("https://story.test/api/profiles"))
    );
    const payload = await response.json() as {
      profiles: Array<{ username: string }>;
    };

    expect(response.status).toBe(200);
    expect(payload.profiles[0]).toMatchObject({ username: "phil" });
    expect(JSON.stringify(payload)).not.toContain("passwordHash");
  });

  it("sets the session cookie on login and reads it on the session route", async () => {
    const store = StoryStore.createMemory(createSeedStoreData());
    const handleRequest = createFetchApiHandler({ store });

    const loginResponse = requireResponse(
      await handleRequest(
        new Request("https://story.test/api/auth/login", {
          body: JSON.stringify({ password: "0000", username: "phil" }),
          headers: { "Content-Type": "application/json" },
          method: "POST"
        })
      )
    );
    const setCookie = loginResponse.headers.get("Set-Cookie");

    expect(loginResponse.status).toBe(200);
    expect(setCookie).toContain("chatsim_session=");

    const sessionResponse = requireResponse(
      await handleRequest(
        new Request("https://story.test/api/auth/session", {
          headers: { Cookie: setCookie ?? "" }
        })
      )
    );
    const payload = await sessionResponse.json() as {
      session: { user: { username: string } } | null;
    };

    expect(payload.session?.user.username).toBe("phil");
  });
});
