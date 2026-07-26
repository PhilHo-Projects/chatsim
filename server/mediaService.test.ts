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

function createClientQueryGate(
  basePool: Pool,
  matches: (query: string) => boolean
) {
  let releaseQuery: () => void = () => undefined;
  let signalQueryReached: () => void = () => undefined;
  let hasBlocked = false;
  const queryReached = new Promise<void>((resolve) => {
    signalQueryReached = resolve;
  });
  const queryReleased = new Promise<void>((resolve) => {
    releaseQuery = resolve;
  });
  const gatedPool = new Proxy(basePool, {
    get(target, property) {
      if (property === "connect") {
        return async () => {
          const client = await target.connect();

          return new Proxy(client, {
            get(clientTarget, clientProperty) {
              const value = Reflect.get(
                clientTarget,
                clientProperty,
                clientTarget
              );

              if (clientProperty !== "query") {
                return typeof value === "function"
                  ? value.bind(clientTarget)
                  : value;
              }

              return async (...args: unknown[]) => {
                const query = typeof args[0] === "string" ? args[0] : "";

                if (!hasBlocked && matches(query)) {
                  hasBlocked = true;
                  signalQueryReached();
                  await queryReleased;
                }

                return (
                  clientTarget.query.bind(clientTarget) as (
                    ...queryArgs: unknown[]
                  ) => Promise<unknown>
                )(...args);
              };
            }
          });
        };
      }

      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    }
  });

  return {
    pool: gatedPool as Pool,
    queryReached,
    releaseQuery
  };
}

class FakeObjectStorage implements ObjectStorage {
  readonly originals = new Map<
    string,
    { body: Buffer; cacheControl?: string; contentType: string }
  >();
  readonly variants = new Map<
    string,
    { body: Buffer; cacheControl: string; contentType: string }
  >();
  failDeleteAfterRemoval = false;
  onFirstVariantPut?: () => Promise<void>;
  presignCalls = 0;

  async presignOriginalPut(
    key: string,
    contentType: string,
    _contentLength: number,
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

    if (this.onFirstVariantPut) {
      const callback = this.onFirstVariantPut;
      this.onFirstVariantPut = undefined;
      await callback();
    }
  }

  async deleteOriginals(keys: string[]) {
    keys.forEach((key) => this.originals.delete(key));

    if (this.failDeleteAfterRemoval) {
      this.failDeleteAfterRemoval = false;
      throw new Error("Fake R2 delete failed after removing originals.");
    }
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

  it("limits unfinished upload reservations per user", async () => {
    for (let index = 0; index < 10; index += 1) {
      await media.createUpload({
        kind: "avatar",
        mimeType: "image/png",
        sizeBytes: 1024,
        userId: ownerId
      });
    }

    await expect(
      media.createUpload({
        kind: "avatar",
        mimeType: "image/png",
        sizeBytes: 1024,
        userId: ownerId
      })
    ).rejects.toMatchObject({
      code: "RATE_LIMITED",
      statusCode: 429
    });
  });

  it("reaps abandoned staging uploads so reservations recover", async () => {
    const created = await media.createUpload({
      kind: "avatar",
      mimeType: "image/png",
      sizeBytes: 1024,
      userId: ownerId
    });
    await pool.query(
      `UPDATE images
       SET updated_at = '2026-07-24T11:00:00.000Z'
       WHERE id = $1`,
      [created.image.id]
    );

    const cleaned = await media.cleanupStaleUploads(ownerId);
    const replacement = await media.createUpload({
      kind: "avatar",
      mimeType: "image/png",
      sizeBytes: 1024,
      userId: ownerId
    });
    const stale = await pool.query<{ status: string }>(
      "SELECT status FROM images WHERE id = $1",
      [created.image.id]
    );

    expect(cleaned).toBe(1);
    expect(stale.rows[0].status).toBe("deleted");
    expect(replacement.image.status).toBe("pending");
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

  it("allows only one image completion at a time", async () => {
    const source = await sharp({
      create: {
        background: "navy",
        channels: 3,
        height: 30,
        width: 40
      }
    })
      .png()
      .toBuffer();
    const first = await media.createUpload({
      kind: "avatar",
      mimeType: "image/png",
      sizeBytes: source.byteLength,
      userId: ownerId
    });
    const second = await media.createUpload({
      kind: "avatar",
      mimeType: "image/png",
      sizeBytes: source.byteLength,
      userId: ownerId
    });
    storage.upload(await getObjectKey(first.image.id), source, "image/png");
    storage.upload(await getObjectKey(second.image.id), source, "image/png");
    let releaseFirst: () => void = () => undefined;
    let signalFirstVariant: () => void = () => undefined;
    const firstVariantReached = new Promise<void>((resolve) => {
      signalFirstVariant = resolve;
    });
    const firstVariantReleased = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    storage.onFirstVariantPut = async () => {
      signalFirstVariant();
      await firstVariantReleased;
    };

    const firstCompletion = media.completeUpload(ownerId, first.image.id);
    await firstVariantReached;
    let secondError: unknown;

    try {
      await media.completeUpload(ownerId, second.image.id);
    } catch (error) {
      secondError = error;
    } finally {
      releaseFirst();
      await firstCompletion;
    }

    expect(secondError).toMatchObject({
      code: "RATE_LIMITED",
      statusCode: 429
    });
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

  it("does not resurrect an image deleted during completion", async () => {
    const source = await sharp({
      create: {
        background: "purple",
        channels: 3,
        height: 30,
        width: 40
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
    storage.onFirstVariantPut = () =>
      media.deleteImage(ownerId, created.image.id);

    await expect(
      media.completeUpload(ownerId, created.image.id)
    ).rejects.toMatchObject({ statusCode: 409 });

    const image = await pool.query<{ status: string }>(
      "SELECT status FROM images WHERE id = $1",
      [created.image.id]
    );
    expect(image.rows[0].status).toBe("deleted");
    expect(storage.originals.size).toBe(0);
    expect(storage.variants.size).toBe(0);
  });

  it("deletes the object keys committed after authorization but before claim", async () => {
    const source = await sharp({
      create: {
        background: "magenta",
        channels: 3,
        height: 30,
        width: 40
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
    const gate = createClientQueryGate(
      pool,
      (query) => /SET status = 'deleting'/.test(query)
    );
    const raceMedia = new MediaService({
      now: () => new Date("2026-07-25T12:00:00.000Z"),
      pool: gate.pool,
      publicBaseUrl: "https://media.chatsim.philippeho.dev",
      storage
    });
    let deletion: Promise<void> | undefined;
    storage.onFirstVariantPut = async () => {
      deletion = raceMedia.deleteImage(ownerId, created.image.id);
      await gate.queryReached;
    };

    await raceMedia.completeUpload(ownerId, created.image.id);
    gate.releaseQuery();
    await deletion;

    const image = await pool.query<{ status: string }>(
      "SELECT status FROM images WHERE id = $1",
      [created.image.id]
    );
    expect(image.rows[0].status).toBe("deleted");
    expect(storage.originals.size).toBe(0);
    expect(storage.variants.size).toBe(0);
  });

  it("leaves failed deletions recoverable and retries idempotently", async () => {
    const source = await sharp({
      create: {
        background: "orange",
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
    storage.failDeleteAfterRemoval = true;

    await expect(
      media.deleteImage(ownerId, created.image.id)
    ).rejects.toThrow("Fake R2 delete failed");

    const interrupted = await pool.query<{ status: string }>(
      "SELECT status FROM images WHERE id = $1",
      [created.image.id]
    );
    expect(interrupted.rows[0].status).toBe("deleting");

    await media.deleteImage(ownerId, created.image.id);
    await media.deleteImage(ownerId, created.image.id);

    const recovered = await pool.query<{ status: string }>(
      "SELECT status FROM images WHERE id = $1",
      [created.image.id]
    );
    expect(recovered.rows[0].status).toBe("deleted");
  });

  it("reclaims a stale processing upload after its lease expires", async () => {
    const source = await sharp({
      create: {
        background: "cyan",
        channels: 3,
        height: 30,
        width: 40
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
    await pool.query(
      `UPDATE images
       SET status = 'processing',
           updated_at = '2026-07-25T11:30:00.000Z'
       WHERE id = $1`,
      [created.image.id]
    );

    const completed = await media.completeUpload(ownerId, created.image.id);

    expect(completed.image.status).toBe("ready");
  });

  it("keeps the winning attempt intact after a stale worker loses its claim", async () => {
    const source = await sharp({
      create: {
        background: "magenta",
        channels: 3,
        height: 30,
        width: 40
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
    let winner:
      | Awaited<ReturnType<MediaService["completeUpload"]>>
      | undefined;
    const winningWorker = new MediaService({
      now: () => new Date("2026-07-25T12:00:00.000Z"),
      pool,
      publicBaseUrl: "https://media.chatsim.philippeho.dev",
      storage
    });
    storage.onFirstVariantPut = async () => {
      await pool.query(
        `UPDATE images
         SET updated_at = '2026-07-25T11:30:00.000Z'
         WHERE id = $1`,
        [created.image.id]
      );
      winner = await winningWorker.completeUpload(ownerId, created.image.id);
    };

    await expect(
      media.completeUpload(ownerId, created.image.id)
    ).rejects.toMatchObject({ statusCode: 409 });

    const repeated = await media.completeUpload(ownerId, created.image.id);
    expect(repeated).toEqual(winner);
    expect(storage.variants.size).toBe(3);
    expect(storage.originals.size).toBe(1);
  });
});

async function getObjectKey(imageId: string) {
  const result = await pool.query<{ object_key: string }>(
    "SELECT object_key FROM images WHERE id = $1",
    [imageId]
  );
  return result.rows[0].object_key;
}
