// @vitest-environment node
import { Pool } from "pg";
import sharp from "sharp";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it
} from "vitest";
import { runMigrations } from "./db/migrations";
import { MediaService } from "./mediaService";
import type {
  ObjectHead,
  ObjectStorage,
  PresignedUpload
} from "./objectStorage";
import { StoryStore } from "./storyStore";

const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  "postgresql://chatsim_dev:chatsim_dev@127.0.0.1:54339/chatsim_test";
const adminPool = new Pool({ connectionString: testDatabaseUrl });
const pool = new Pool({
  connectionString: testDatabaseUrl,
  options: "-c search_path=media_service_test"
});
let store: StoryStore;
let storage: FakeObjectStorage;
let media: MediaService;
let ownerId: string;
let adminId: string;

class FakeObjectStorage implements ObjectStorage {
  readonly originals = new Map<
    string,
    { body: Buffer; cacheControl?: string; contentType: string }
  >();
  readonly variants = new Map<
    string,
    { body: Buffer; cacheControl: string; contentType: string }
  >();
  presignCalls = 0;

  async presignOriginalPut(
    key: string,
    contentType: string,
    expiresInSeconds: number
  ): Promise<PresignedUpload> {
    this.presignCalls += 1;
    return {
      expiresAt: new Date(
        Date.parse("2026-07-25T12:00:00.000Z") + expiresInSeconds * 1000
      ),
      headers: { "Content-Type": contentType },
      method: "PUT",
      url: `https://uploads.example/${key}`
    };
  }

  async headOriginal(key: string): Promise<ObjectHead | null> {
    const object = this.originals.get(key);
    return object
      ? {
          contentLength: object.body.byteLength,
          contentType: object.contentType
        }
      : null;
  }

  async getOriginal(key: string, maxBytes: number): Promise<Buffer> {
    const object = this.originals.get(key);

    if (!object) {
      throw new Error("Missing fake original.");
    }

    if (object.body.byteLength > maxBytes) {
      throw new Error("Fake object exceeded download bound.");
    }

    return object.body;
  }

  async copyOriginal(sourceKey: string, destinationKey: string) {
    const source = this.originals.get(sourceKey);

    if (!source) {
      throw new Error("Missing fake source.");
    }

    this.originals.set(destinationKey, {
      ...source,
      body: Buffer.from(source.body)
    });
  }

  async putVariant(
    key: string,
    body: Buffer,
    input: { cacheControl: string; contentType: string }
  ) {
    this.variants.set(key, { ...input, body: Buffer.from(body) });
  }

  async deleteOriginals(keys: string[]) {
    keys.forEach((key) => this.originals.delete(key));
  }

  async deleteVariants(keys: string[]) {
    keys.forEach((key) => this.variants.delete(key));
  }

  upload(key: string, body: Buffer, contentType: string) {
    this.originals.set(key, { body, contentType });
  }
}

beforeAll(async () => {
  await adminPool.query("DROP SCHEMA IF EXISTS media_service_test CASCADE");
  await adminPool.query("CREATE SCHEMA media_service_test");
  await runMigrations(pool);
});

beforeEach(async () => {
  await pool.query(
    `TRUNCATE upload_audit_log, stories, sessions, images, users
     RESTART IDENTITY CASCADE`
  );
  store = await StoryStore.open({
    pool,
    runMigrations: false,
    startCleanup: false
  });
  const owner = await store.register({
    displayName: "Image Owner",
    password: "owner-password-2026",
    username: "image-owner"
  });
  const admin = await store.bootstrapAdmin({
    displayName: "Admin",
    password: "admin-password-2026",
    username: "admin"
  });
  ownerId = owner.user.id;
  adminId = admin.user.id;
  storage = new FakeObjectStorage();
  media = new MediaService({
    now: () => new Date("2026-07-25T12:00:00.000Z"),
    pool,
    publicBaseUrl: "https://media.chatsim.philippeho.dev",
    storage
  });
});

afterAll(async () => {
  await pool.end();
  await adminPool.query("DROP SCHEMA IF EXISTS media_service_test CASCADE");
  await adminPool.end();
});

describe("MediaService", () => {
  it("creates a five-minute content-type-bound pending upload and audit row", async () => {
    const created = await media.createUpload({
      ipAddress: "127.0.0.1",
      kind: "avatar",
      mimeType: "image/png",
      sizeBytes: 1024,
      userAgent: "vitest",
      userId: ownerId
    });
    const image = await pool.query<{
      object_key: string;
      status: string;
    }>("SELECT object_key, status FROM images WHERE id = $1", [
      created.image.id
    ]);
    const audit = await pool.query<{ action: string }>(
      "SELECT action FROM upload_audit_log WHERE image_id = $1",
      [created.image.id]
    );

    expect(created.upload).toEqual({
      expiresAt: "2026-07-25T12:05:00.000Z",
      headers: { "Content-Type": "image/png" },
      method: "PUT",
      url: expect.stringContaining("/staging/")
    });
    expect(image.rows[0]).toMatchObject({ status: "pending" });
    expect(audit.rows).toEqual([{ action: "upload_started" }]);
  });

  it("sanitizes a valid image into immutable WebP variants idempotently", async () => {
    const source = await sharp({
      create: {
        background: { alpha: 1, b: 120, g: 80, r: 40 },
        channels: 4,
        height: 300,
        width: 500
      }
    })
      .withMetadata({
        exif: {
          IFD0: { Artist: "should be stripped" }
        }
      })
      .png()
      .toBuffer();
    const created = await media.createUpload({
      kind: "avatar",
      mimeType: "image/png",
      sizeBytes: source.byteLength,
      userId: ownerId
    });
    const stagingKey = await getObjectKey(created.image.id);
    storage.upload(stagingKey, source, "image/png");

    const completed = await media.completeUpload(ownerId, created.image.id);
    const writesAfterFirstCompletion = storage.variants.size;
    const repeated = await media.completeUpload(ownerId, created.image.id);
    const variantMetadata = await Promise.all(
      [...storage.variants.values()].map((variant) =>
        sharp(variant.body).metadata()
      )
    );

    expect(completed).toEqual(repeated);
    expect(writesAfterFirstCompletion).toBe(3);
    expect(storage.variants.size).toBe(3);
    expect(completed.image.status).toBe("ready");
    expect(completed.image.variants).toEqual({
      card: expect.stringContaining("https://media.chatsim.philippeho.dev/"),
      full: expect.stringContaining("https://media.chatsim.philippeho.dev/"),
      thumb: expect.stringContaining("https://media.chatsim.philippeho.dev/")
    });
    expect(variantMetadata.map((item) => [item.width, item.height])).toEqual([
      [256, 256],
      [640, 640],
      [1200, 1200]
    ]);
    expect(variantMetadata.every((item) => item.format === "webp")).toBe(true);
    expect(variantMetadata.every((item) => item.exif === undefined)).toBe(true);
    expect(
      [...storage.variants.values()].every(
        (variant) =>
          variant.cacheControl === "public, max-age=31536000, immutable"
      )
    ).toBe(true);
    expect(storage.originals.has(stagingKey)).toBe(false);
  });

  it("rejects MIME mismatches and removes failed staging data", async () => {
    const source = await sharp({
      create: {
        background: "red",
        channels: 3,
        height: 10,
        width: 10
      }
    })
      .jpeg()
      .toBuffer();
    const created = await media.createUpload({
      kind: "story_cover",
      mimeType: "image/png",
      sizeBytes: source.byteLength,
      userId: ownerId
    });
    const stagingKey = await getObjectKey(created.image.id);
    storage.upload(stagingKey, source, "image/png");

    await expect(
      media.completeUpload(ownerId, created.image.id)
    ).rejects.toMatchObject({ statusCode: 422 });

    const image = await pool.query<{ status: string }>(
      "SELECT status FROM images WHERE id = $1",
      [created.image.id]
    );
    const audit = await pool.query<{ action: string }>(
      "SELECT action FROM upload_audit_log WHERE image_id = $1 ORDER BY id",
      [created.image.id]
    );

    expect(image.rows[0].status).toBe("rejected");
    expect(audit.rows.map((row) => row.action)).toEqual([
      "upload_started",
      "rejected"
    ]);
    expect(storage.originals.has(stagingKey)).toBe(false);
    expect(storage.variants.size).toBe(0);
  });

  it("rejects unsupported formats, oversized dimensions, and foreign owners", async () => {
    await expect(
      media.createUpload({
        kind: "avatar",
        mimeType: "image/gif",
        sizeBytes: 100,
        userId: ownerId
      })
    ).rejects.toMatchObject({ statusCode: 415 });

    const source = await sharp({
      create: {
        background: "green",
        channels: 3,
        height: 1,
        width: 8193
      }
    })
      .png()
      .toBuffer();
    const created = await media.createUpload({
      kind: "story_cover",
      mimeType: "image/png",
      sizeBytes: source.byteLength,
      userId: ownerId
    });
    const stagingKey = await getObjectKey(created.image.id);
    storage.upload(stagingKey, source, "image/png");

    await expect(
      media.completeUpload(ownerId, created.image.id)
    ).rejects.toMatchObject({ statusCode: 422 });

    const other = await store.register({
      displayName: "Other Owner",
      password: "other-owner-password",
      username: "other-owner"
    });
    await expect(
      media.deleteImage(other.user.id, created.image.id)
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("allows an admin to delete another owner's ready image", async () => {
    const source = await sharp({
      create: {
        background: "blue",
        channels: 3,
        height: 30,
        width: 40
      }
    })
      .webp()
      .toBuffer();
    const created = await media.createUpload({
      kind: "story_cover",
      mimeType: "image/webp",
      sizeBytes: source.byteLength,
      userId: ownerId
    });
    const stagingKey = await getObjectKey(created.image.id);
    storage.upload(stagingKey, source, "image/webp");
    await media.completeUpload(ownerId, created.image.id);

    await media.deleteImage(adminId, created.image.id);

    const image = await pool.query<{ status: string }>(
      "SELECT status FROM images WHERE id = $1",
      [created.image.id]
    );
    expect(image.rows[0].status).toBe("deleted");
    expect(storage.originals.size).toBe(0);
    expect(storage.variants.size).toBe(0);
  });
});

async function getObjectKey(imageId: string) {
  const result = await pool.query<{ object_key: string }>(
    "SELECT object_key FROM images WHERE id = $1",
    [imageId]
  );
  return result.rows[0].object_key;
}
