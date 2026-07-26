import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import sharp, { type Metadata } from "sharp";
import { createDatabasePool } from "./db/pool";
import { HttpError } from "./httpError";
import type { ImageVariants, UserRole } from "./storyStore";
import type { ObjectStorage } from "./objectStorage";
import { createR2ObjectStorageFromEnvironment } from "./objectStorage";

export type ImageKind =
  | "avatar"
  | "profile"
  | "story_cover"
  | "scene_art"
  | "sprite";

type MediaServiceOptions = {
  now?: () => Date;
  pool: Pool;
  publicBaseUrl: string;
  storage: ObjectStorage;
};

type UploadIdentity = {
  ipAddress?: string;
  userAgent?: string;
  userId: string;
};

type ImageRow = {
  height: number | null;
  id: string;
  kind: ImageKind;
  mime_type: string;
  object_key: string;
  owner_id: string;
  processing_token: string | null;
  requester_role: UserRole;
  size_bytes: string;
  status:
    | "pending"
    | "processing"
    | "ready"
    | "rejected"
    | "deleting"
    | "deleted";
  updated_at: Date;
  variants: unknown;
  width: number | null;
};

type StoredVariant = {
  height: number;
  key: string;
  sizeBytes: number;
  width: number;
};

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_PENDING_UPLOADS_PER_USER = 10;
const MAX_PENDING_BYTES_PER_USER = 50 * 1024 * 1024;
const MAX_CONCURRENT_COMPLETIONS = 1;
const STALE_UPLOAD_AGE_MS = 24 * 60 * 60 * 1000;
const STALE_UPLOAD_CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;
const MAX_SIDE_PIXELS = 8192;
const MAX_INPUT_PIXELS = 40_000_000;
const UPLOAD_EXPIRY_SECONDS = 5 * 60;
const PROCESSING_LEASE_MS = 15 * 60 * 1000;
const IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable";
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp"
]);
const FORMAT_MIME_TYPES: Record<string, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp"
};
const AVATAR_SIZES = [
  ["thumb", 256],
  ["card", 640],
  ["full", 1200]
] as const;
const ART_SIZES = [
  ["thumb", 320],
  ["card", 960],
  ["full", 1920]
] as const;

export class MediaService {
  private activeCompletions = 0;
  private readonly cleanupTimer: NodeJS.Timeout;
  private readonly now: () => Date;
  private readonly publicBaseUrl: string;

  constructor(private readonly options: MediaServiceOptions) {
    this.now = options.now ?? (() => new Date());
    this.publicBaseUrl = options.publicBaseUrl.replace(/\/+$/, "");

    if (!this.publicBaseUrl) {
      throw new Error("A public media base URL is required.");
    }

    this.cleanupTimer = setInterval(() => {
      void this.cleanupStaleUploads().catch((error: unknown) => {
        console.error("Failed to clean stale image uploads", error);
      });
    }, STALE_UPLOAD_CLEANUP_INTERVAL_MS);
    this.cleanupTimer.unref();
  }

  async createUpload(
    input: UploadIdentity & {
      kind: ImageKind;
      mimeType: string;
      sizeBytes: number;
    }
  ) {
    if (!ALLOWED_MIME_TYPES.has(input.mimeType)) {
      throw new HttpError(
        "Only static JPEG, PNG, and WebP images are supported.",
        415,
        "UNSUPPORTED_MEDIA_TYPE"
      );
    }

    if (
      !Number.isSafeInteger(input.sizeBytes) ||
      input.sizeBytes < 1 ||
      input.sizeBytes > MAX_UPLOAD_BYTES
    ) {
      throw new HttpError(
        "Image size must be between 1 byte and 10 MiB.",
        413,
        "PAYLOAD_TOO_LARGE"
      );
    }

    await this.cleanupStaleUploads(input.userId);

    const imageId = `image-${randomUUID()}`;
    const stagingKey = `staging/${input.userId}/${imageId}`;
    const now = this.now();
    const client = await this.options.pool.connect();

    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `chatsim-upload-quota:${input.userId}`
      ]);
      const quota = await client.query<{
        count: string;
        size_bytes: string;
      }>(
        `SELECT
           COUNT(*)::text AS count,
           COALESCE(SUM(size_bytes), 0)::text AS size_bytes
         FROM images
         WHERE owner_id = $1
           AND status IN ('pending', 'processing', 'deleting')`,
        [input.userId]
      );
      const pendingCount = Number(quota.rows[0]?.count ?? 0);
      const pendingBytes = Number(quota.rows[0]?.size_bytes ?? 0);

      if (
        pendingCount >= MAX_PENDING_UPLOADS_PER_USER ||
        pendingBytes + input.sizeBytes > MAX_PENDING_BYTES_PER_USER
      ) {
        throw new HttpError(
          "Too many unfinished uploads.",
          429,
          "RATE_LIMITED",
          60
        );
      }

      await client.query(
        `INSERT INTO images (
           id, owner_id, kind, object_key, mime_type, size_bytes,
           status, created_at, updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, $7)`,
        [
          imageId,
          input.userId,
          input.kind,
          stagingKey,
          input.mimeType,
          input.sizeBytes,
          now
        ]
      );
      await this.audit(client, {
        action: "upload_started",
        ...input,
        imageId,
        objectKey: stagingKey
      });
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    try {
      const upload = await this.options.storage.presignOriginalPut(
        stagingKey,
        input.mimeType,
        input.sizeBytes,
        UPLOAD_EXPIRY_SECONDS
      );

      return {
        image: this.publicImage({
          height: null,
          id: imageId,
          kind: input.kind,
          mime_type: input.mimeType,
          object_key: stagingKey,
          owner_id: input.userId,
          processing_token: null,
          requester_role: "member",
          size_bytes: String(input.sizeBytes),
          status: "pending",
          updated_at: now,
          variants: {},
          width: null
        }),
        upload: {
          ...upload,
          expiresAt: upload.expiresAt.toISOString()
        }
      };
    } catch (error) {
      await this.rejectImage(imageId, input, stagingKey);
      throw error;
    }
  }

  async cleanupStaleUploads(userId?: string) {
    const staleBefore = new Date(this.now().getTime() - STALE_UPLOAD_AGE_MS);
    const result = await this.options.pool.query<{
      id: string;
      owner_id: string;
    }>(
      `SELECT id, owner_id
       FROM images
       WHERE (
           (status IN ('pending', 'processing') AND updated_at <= $1)
           OR status = 'deleting'
         )
         AND ($2::text IS NULL OR owner_id = $2)
       ORDER BY updated_at, id
       LIMIT 100`,
      [staleBefore, userId ?? null]
    );
    let cleaned = 0;

    for (const image of result.rows) {
      try {
        await this.deleteImage(image.owner_id, image.id);
        cleaned += 1;
      } catch (error) {
        console.error("Failed to delete a stale image upload", error);
      }
    }

    return cleaned;
  }

  async completeUpload(
    userId: string,
    imageId: string,
    identity: Omit<UploadIdentity, "userId"> = {}
  ) {
    const image = await this.authorizedImage(userId, imageId);

    if (image.status === "ready") {
      return { image: this.publicImage(image) };
    }

    if (this.activeCompletions >= MAX_CONCURRENT_COMPLETIONS) {
      throw new HttpError(
        "Image processing is busy. Try again shortly.",
        429,
        "RATE_LIMITED",
        1
      );
    }

    this.activeCompletions += 1;

    try {
      return await this.processUpload(userId, image, identity);
    } finally {
      this.activeCompletions -= 1;
    }
  }

  private async processUpload(
    userId: string,
    image: ImageRow,
    identity: Omit<UploadIdentity, "userId">
  ) {
    if (image.status !== "pending" && image.status !== "processing") {
      throw new HttpError(
        "Image cannot be completed in its current state.",
        409,
        "CONFLICT"
      );
    }

    const claimTime = this.now();
    const staleBefore = new Date(claimTime.getTime() - PROCESSING_LEASE_MS);
    const processingToken = randomUUID();
    const claimed = await this.options.pool.query(
      `UPDATE images
       SET status = 'processing', processing_token = $4, updated_at = $1
       WHERE id = $2
         AND (
           status = 'pending'
           OR (status = 'processing' AND updated_at <= $3)
         )`,
      [claimTime, image.id, staleBefore, processingToken]
    );

    if (claimed.rowCount !== 1) {
      const current = await this.authorizedImage(userId, image.id);

      if (current.status === "ready") {
        return { image: this.publicImage(current) };
      }

      throw new HttpError("Image completion is already running.", 409, "CONFLICT");
    }

    const variantKeys: string[] = [];
    let originalKey: string | undefined;

    try {
      const source = await this.loadAndValidateSource(image);
      const digest = createHash("sha256").update(source.body).digest("hex");
      const extension = source.mimeType.split("/")[1].replace("jpeg", "jpg");
      originalKey =
        `originals/${image.owner_id}/${image.id}/` +
        `${digest}-${processingToken}.${extension}`;
      const variants = await this.createVariants(
        image,
        source.body,
        digest,
        processingToken
      );

      variantKeys.push(...Object.values(variants).map((variant) => variant.key));
      await this.options.storage.copyOriginal(image.object_key, originalKey);

      for (const variant of Object.values(variants)) {
        await this.options.storage.putVariant(
          variant.key,
          variant.body,
          {
            cacheControl: IMMUTABLE_CACHE_CONTROL,
            contentType: "image/webp"
          }
        );
      }

      const storedVariants = Object.fromEntries(
        Object.entries(variants).map(([name, variant]) => [
          name,
          {
            height: variant.height,
            key: variant.key,
            sizeBytes: variant.body.byteLength,
            width: variant.width
          } satisfies StoredVariant
        ])
      );
      const client = await this.options.pool.connect();

      try {
        await client.query("BEGIN");
        const updated = await client.query<ImageRow>(
          `UPDATE images
           SET object_key = $1,
               mime_type = $2,
               width = $3,
               height = $4,
               size_bytes = $5,
               variants = $6::jsonb,
               status = 'ready',
               processing_token = NULL,
               updated_at = $7
           WHERE id = $8
             AND status = 'processing'
             AND processing_token = $10
           RETURNING *, $9::text AS requester_role`,
          [
            originalKey,
            source.mimeType,
            source.width,
            source.height,
            source.body.byteLength,
            JSON.stringify(storedVariants),
            this.now(),
            image.id,
            image.requester_role,
            processingToken
          ]
        );

        if (updated.rowCount !== 1) {
          throw new HttpError(
            "Image completion was cancelled.",
            409,
            "CONFLICT"
          );
        }

        await this.audit(client, {
          action: "upload_completed",
          ...identity,
          imageId: image.id,
          objectKey: originalKey,
          userId
        });
        await client.query("COMMIT");
        await this.options.storage
          .deleteOriginals([image.object_key])
          .catch((cleanupError: unknown) => {
            console.error("Failed to remove completed upload staging object", cleanupError);
          });

        return { image: this.publicImage(updated.rows[0]) };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      await Promise.allSettled([
        this.options.storage.deleteVariants(variantKeys),
        this.options.storage.deleteOriginals(
          [originalKey].filter(
            (key): key is string => Boolean(key)
          )
        )
      ]);
      const rejected = await this.rejectImage(
        image.id,
        { ...identity, userId },
        image.object_key,
        processingToken
      );

      if (rejected) {
        await this.options.storage
          .deleteOriginals([image.object_key])
          .catch(() => undefined);
      }

      if (error instanceof HttpError) {
        throw error;
      }

      throw new HttpError(
        "Image could not be processed.",
        422,
        "MEDIA_REJECTED"
      );
    }
  }

  async deleteImage(
    userId: string,
    imageId: string,
    identity: Omit<UploadIdentity, "userId"> = {}
  ) {
    const image = await this.authorizedImage(userId, imageId);

    if (image.status === "deleted") {
      return;
    }

    let deletionObjectKey: string | null = null;
    let deletionVariantKeys: string[] = [];
    const client = await this.options.pool.connect();

    try {
      await client.query("BEGIN");
      const claimed = await client.query<{
        object_key: string;
        variants: Record<string, unknown>;
      }>(
        `UPDATE images
         SET status = 'deleting', processing_token = NULL, updated_at = $1
         WHERE id = $2 AND status <> 'deleted'
         RETURNING object_key, variants`,
        [this.now(), imageId]
      );

      if (claimed.rowCount !== 1) {
        await client.query("ROLLBACK");
        return;
      }

      deletionObjectKey = claimed.rows[0].object_key;
      deletionVariantKeys = this.variantKeys(claimed.rows[0].variants);

      const storyboards = await client.query<{
        id: string;
        storyboard: { scenes?: Array<Record<string, unknown>> };
      }>(
        "SELECT id, storyboard FROM stories WHERE storyboard::text LIKE $1",
        [`%${imageId}%`]
      );

      for (const story of storyboards.rows) {
        if (this.removeStoryboardImageReference(story.storyboard, imageId)) {
          await client.query(
            `UPDATE stories
             SET storyboard = $1::jsonb, updated_at = $2
             WHERE id = $3`,
            [JSON.stringify(story.storyboard), this.now(), story.id]
          );
        }
      }

      await client.query(
        `UPDATE users
         SET avatar_image_id = NULL, updated_at = $1
         WHERE avatar_image_id = $2`,
        [this.now(), imageId]
      );
      await client.query(
        `UPDATE stories
         SET cover_image_id = NULL, updated_at = $1
         WHERE cover_image_id = $2`,
        [this.now(), imageId]
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    if (!deletionObjectKey) {
      throw new Error("Deletion claim did not return an object key.");
    }

    await Promise.all([
      this.options.storage.deleteOriginals([deletionObjectKey]),
      this.options.storage.deleteVariants(deletionVariantKeys)
    ]);

    const finalClient = await this.options.pool.connect();

    try {
      await finalClient.query("BEGIN");
      const deleted = await finalClient.query(
        `UPDATE images
         SET status = 'deleted', variants = '{}'::jsonb, updated_at = $1
         WHERE id = $2 AND status = 'deleting'`,
        [this.now(), imageId]
      );

      if (deleted.rowCount === 1) {
        await this.audit(finalClient, {
          action: "deleted",
          ...identity,
          imageId,
          objectKey: deletionObjectKey,
          userId
        });
      }

      await finalClient.query("COMMIT");
    } catch (error) {
      await finalClient.query("ROLLBACK");
      throw error;
    } finally {
      finalClient.release();
    }
  }

  private async loadAndValidateSource(image: ImageRow) {
    const head = await this.options.storage.headOriginal(image.object_key);
    const declaredSize = Number(image.size_bytes);

    if (!head) {
      throw new HttpError("Uploaded image was not found.", 422, "MEDIA_REJECTED");
    }

    if (
      head.contentLength !== declaredSize ||
      head.contentLength < 1 ||
      head.contentLength > MAX_UPLOAD_BYTES
    ) {
      throw new HttpError(
        "Uploaded image size does not match the request.",
        422,
        "MEDIA_REJECTED"
      );
    }

    if (head.contentType !== image.mime_type) {
      throw new HttpError(
        "Uploaded image content type does not match the request.",
        422,
        "MEDIA_REJECTED"
      );
    }

    const body = await this.options.storage.getOriginal(
      image.object_key,
      MAX_UPLOAD_BYTES
    );

    if (body.byteLength !== head.contentLength || body.byteLength > MAX_UPLOAD_BYTES) {
      throw new HttpError(
        "Uploaded image body is invalid.",
        422,
        "MEDIA_REJECTED"
      );
    }

    let metadata: Metadata;

    try {
      metadata = await sharp(body, {
        failOn: "warning",
        limitInputPixels: MAX_INPUT_PIXELS
      }).metadata();
    } catch {
      throw new HttpError(
        "Uploaded image could not be decoded safely.",
        422,
        "MEDIA_REJECTED"
      );
    }

    const mimeType = metadata.format
      ? FORMAT_MIME_TYPES[metadata.format]
      : undefined;
    const rotated =
      metadata.orientation !== undefined &&
      metadata.orientation >= 5 &&
      metadata.orientation <= 8;
    const width = rotated ? metadata.height : metadata.width;
    const height = rotated ? metadata.width : metadata.height;

    if (
      !mimeType ||
      mimeType !== image.mime_type ||
      !width ||
      !height ||
      width > MAX_SIDE_PIXELS ||
      height > MAX_SIDE_PIXELS ||
      width * height > MAX_INPUT_PIXELS ||
      (metadata.pages ?? 1) > 1
    ) {
      throw new HttpError(
        "Uploaded image format or dimensions are not supported.",
        422,
        "MEDIA_REJECTED"
      );
    }

    return { body, height, mimeType, width };
  }

  private async createVariants(
    image: ImageRow,
    body: Buffer,
    digest: string,
    processingToken: string
  ) {
    const square = image.kind === "avatar" || image.kind === "profile";
    const sizes = square ? AVATAR_SIZES : ART_SIZES;
    const results: Record<
      keyof ImageVariants,
      StoredVariant & { body: Buffer }
    > = {} as Record<keyof ImageVariants, StoredVariant & { body: Buffer }>;

    for (const [name, size] of sizes) {
      const pipeline = sharp(body, {
        failOn: "warning",
        limitInputPixels: MAX_INPUT_PIXELS
      })
        .rotate()
        .resize(
          square
            ? { fit: "cover", height: size, width: size }
            : {
                fit: "inside",
                height: size,
                width: size,
                withoutEnlargement: true
              }
        )
        .webp({ effort: 5, quality: 84 });
      const output = await pipeline.toBuffer({ resolveWithObject: true });
      const key =
        `variants/${image.id}/` +
        `${digest}-${processingToken}-${name}.webp`;

      results[name] = {
        body: output.data,
        height: output.info.height,
        key,
        sizeBytes: output.data.byteLength,
        width: output.info.width
      };
    }

    return results;
  }

  private async authorizedImage(userId: string, imageId: string) {
    const result = await this.options.pool.query<ImageRow>(
      `SELECT i.*, requester.role AS requester_role
       FROM images i
       JOIN users requester ON requester.id = $1
       WHERE i.id = $2`,
      [userId, imageId]
    );
    const image = result.rows[0];

    if (!image) {
      throw new HttpError("Image not found.", 404, "NOT_FOUND");
    }

    if (image.owner_id !== userId && image.requester_role !== "admin") {
      throw new HttpError(
        "Image belongs to another user.",
        403,
        "FORBIDDEN"
      );
    }

    return image;
  }

  private publicImage(image: ImageRow) {
    const keys = this.variantKeysByName(image.variants);
    const variants =
      image.status === "ready" && keys
        ? {
            card: this.publicUrl(keys.card),
            full: this.publicUrl(keys.full),
            thumb: this.publicUrl(keys.thumb)
          }
        : null;

    return {
      height: image.height,
      id: image.id,
      kind: image.kind,
      mimeType: image.mime_type,
      sizeBytes: Number(image.size_bytes),
      status: image.status,
      variants,
      width: image.width
    };
  }

  private publicUrl(key: string) {
    return `${this.publicBaseUrl}/${key.replace(/^\/+/, "")}`;
  }

  private variantKeysByName(value: unknown) {
    if (!value || typeof value !== "object") {
      return null;
    }

    const variants = value as Record<
      keyof ImageVariants,
      string | { key?: string }
    >;
    const key = (name: keyof ImageVariants) => {
      const variant = variants[name];
      return typeof variant === "string" ? variant : variant?.key;
    };
    const keys = {
      card: key("card"),
      full: key("full"),
      thumb: key("thumb")
    };

    return keys.card && keys.full && keys.thumb
      ? (keys as Record<keyof ImageVariants, string>)
      : null;
  }

  private variantKeys(value: unknown) {
    const keys = this.variantKeysByName(value);
    return keys ? Object.values(keys) : [];
  }

  private async rejectImage(
    imageId: string,
    identity: UploadIdentity,
    objectKey: string,
    processingToken?: string
  ) {
    const client = await this.options.pool.connect();

    try {
      await client.query("BEGIN");
      const updated = await client.query(
        `UPDATE images
         SET status = 'rejected',
             processing_token = NULL,
             variants = '{}'::jsonb,
             updated_at = $1
         WHERE id = $2
           AND (
             (status = 'pending' AND $3::text IS NULL)
             OR (
               status = 'processing'
               AND processing_token = $3
             )
           )`,
        [this.now(), imageId, processingToken ?? null]
      );

      if (updated.rowCount !== 1) {
        await client.query("ROLLBACK");
        return false;
      }

      await this.audit(client, {
        action: "rejected",
        ...identity,
        imageId,
        objectKey
      });
      await client.query("COMMIT");
      return true;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private async audit(
    client: Pick<Pool, "query">,
    input: UploadIdentity & {
      action:
        | "upload_started"
        | "upload_completed"
        | "rejected"
        | "deleted";
      imageId: string;
      objectKey: string;
    }
  ) {
    await client.query(
      `INSERT INTO upload_audit_log (
         user_id, ip_address, user_agent, image_id, object_key, action,
         created_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        input.userId,
        input.ipAddress ?? null,
        input.userAgent ?? null,
        input.imageId,
        input.objectKey,
        input.action,
        this.now()
      ]
    );
  }

  private removeStoryboardImageReference(
    storyboard: { scenes?: Array<Record<string, unknown>> },
    imageId: string
  ) {
    let changed = false;

    for (const scene of storyboard.scenes ?? []) {
      for (const speaker of ["contact", "viewer"] as const) {
        const profile = scene[speaker];

        if (
          profile &&
          typeof profile === "object" &&
          (profile as Record<string, unknown>).avatarImageId === imageId
        ) {
          (profile as Record<string, unknown>).avatarImageId = null;
          (profile as Record<string, unknown>).avatarUrl = "";
          delete (profile as Record<string, unknown>).avatarImage;
          changed = true;
        }
      }
    }

    return changed;
  }
}

export function createMediaServiceFromEnvironment() {
  const publicBaseUrl = process.env.R2_PUBLIC_BASE_URL?.trim();

  if (!publicBaseUrl) {
    throw new Error("R2_PUBLIC_BASE_URL is required.");
  }

  return new MediaService({
    pool: createDatabasePool(),
    publicBaseUrl,
    storage: createR2ObjectStorageFromEnvironment()
  });
}
