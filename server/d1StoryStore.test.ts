// @vitest-environment node
import { describe, expect, it } from "vitest";
import { D1StoryStore } from "./d1StoryStore";
import { createSeedStoreData, type StoryStoreData } from "./storyStore";

type StoredRow = Record<string, unknown>;

class MemoryD1Database {
  private readonly tables = new Map<string, StoredRow[]>();

  constructor(seed: StoryStoreData) {
    this.tables.set("users", seed.users.map((user) => ({ ...user })));
    this.tables.set("stories", seed.stories.map((story) => ({
      cover_color: story.coverColor,
      created_at: story.createdAt,
      id: story.id,
      owner_id: story.ownerId,
      storyboard_json: JSON.stringify(story.storyboard),
      title: story.title,
      updated_at: story.updatedAt,
      visibility: story.visibility
    })));
    this.tables.set("sessions", []);
  }

  prepare(sql: string) {
    const database = this;

    return {
      bind(...params: unknown[]) {
        return {
          first: <T = StoredRow>() => database.first(sql, params) as Promise<T | null>,
          all: <T = StoredRow>() => database.all(sql, params) as Promise<{ results: T[] }>,
          run: () => database.run(sql, params)
        };
      },
      first: <T = StoredRow>() => database.first(sql, []) as Promise<T | null>,
      all: <T = StoredRow>() => database.all(sql, []) as Promise<{ results: T[] }>,
      run: () => database.run(sql, [])
    };
  }

  private async first(sql: string, params: unknown[]) {
    return (await this.all(sql, params)).results[0] ?? null;
  }

  private async all(sql: string, params: unknown[]) {
    const normalizedSql = sql.replace(/\s+/g, " ").trim();

    if (normalizedSql === "SELECT * FROM users ORDER BY created_at ASC") {
      return { results: [...this.table("users")] };
    }

    if (normalizedSql === "SELECT * FROM stories ORDER BY created_at ASC") {
      return { results: [...this.table("stories")] };
    }

    if (normalizedSql === "SELECT * FROM stories WHERE owner_id = ?") {
      return {
        results: this.table("stories").filter((story) => story.owner_id === params[0])
      };
    }

    throw new Error(`Unhandled all SQL: ${normalizedSql}`);
  }

  private async run(sql: string, params: unknown[]) {
    const normalizedSql = sql.replace(/\s+/g, " ").trim();

    if (normalizedSql.startsWith("INSERT INTO sessions")) {
      this.table("sessions").push({
        created_at: params[2],
        token: params[0],
        user_id: params[1]
      });
      return { success: true };
    }

    if (normalizedSql.startsWith("INSERT INTO stories")) {
      this.table("stories").push({
        cover_color: params[4],
        created_at: params[6],
        id: params[0],
        owner_id: params[1],
        storyboard_json: params[2],
        title: params[3],
        updated_at: params[7],
        visibility: params[5]
      });
      return { success: true };
    }

    throw new Error(`Unhandled run SQL: ${normalizedSql}`);
  }

  private table(name: string) {
    const table = this.tables.get(name);

    if (!table) {
      throw new Error(`Unknown table: ${name}`);
    }

    return table;
  }
}

describe("D1StoryStore", () => {
  it("returns public profiles from D1 rows without leaking private fields", async () => {
    const store = new D1StoryStore(new MemoryD1Database(createSeedStoreData()));

    const profiles = await store.getPublicProfiles();

    expect(profiles[0]).toMatchObject({
      stories: [
        expect.objectContaining({
          storyId: "story-phil-1",
          title: "Ketamine prison"
        }),
        expect.objectContaining({
          storyId: "story-phil-battle",
          title: "Battle"
        })
      ],
      username: "phil"
    });
    expect(JSON.stringify(profiles)).not.toContain("passwordHash");
  });

  it("creates stories with the same public record shape as the local store", async () => {
    const store = new D1StoryStore(new MemoryD1Database(createSeedStoreData()));

    const session = await store.login({ password: "0000", username: "phil" });
    const story = await store.createStory(session.user.id, {
      title: "Cloudflare test"
    });

    expect(story).toMatchObject({
      ownerId: "user-phil",
      title: "Cloudflare test",
      visibility: "public"
    });
    expect(story.storyboard).toMatchObject({
      id: story.id,
      title: "Cloudflare test"
    });
  });
});
