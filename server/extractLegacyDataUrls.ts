import type { Pool } from "pg";
import { createDatabasePool } from "./db/pool";
import { runMigrations } from "./db/migrations";
import {
  findLegacyDataUrlReferences,
  type LegacyDataUrlReference
} from "./legacyDataUrls";
import { MediaService } from "./mediaService";
import { createR2ObjectStorageFromEnvironment } from "./objectStorage";

type StoryRow = {
  id: string;
  owner_id: string;
  storyboard: {
    scenes?: Array<Record<string, unknown>>;
  };
};

async function findStories(pool: Pool) {
  const result = await pool.query<StoryRow>(
    "SELECT id, owner_id, storyboard FROM stories ORDER BY id"
  );

  return result.rows
    .map((story) => ({
      references: findLegacyDataUrlReferences(story.storyboard),
      story
    }))
    .filter((entry) => entry.references.length > 0);
}

async function uploadReference(
  media: MediaService,
  ownerId: string,
  reference: LegacyDataUrlReference
) {
  const created = await media.createUpload({
    kind: "avatar",
    mimeType: reference.mimeType,
    sizeBytes: reference.body.byteLength,
    userAgent: "legacy-data-url-extractor",
    userId: ownerId
  });
  const response = await fetch(created.upload.url, {
    body: Uint8Array.from(reference.body).buffer,
    headers: created.upload.headers,
    method: created.upload.method
  });

  if (!response.ok) {
    throw new Error(`R2 staging upload failed with status ${response.status}.`);
  }

  const completed = await media.completeUpload(ownerId, created.image.id, {
    userAgent: "legacy-data-url-extractor"
  });
  return completed.image.id;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const databaseUrl = process.env.DATABASE_URL;
  const publicBaseUrl = process.env.R2_PUBLIC_BASE_URL?.trim();

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required.");
  }

  const pool = createDatabasePool(databaseUrl);

  try {
    await runMigrations(pool);
    const entries = await findStories(pool);
    const referenceCount = entries.reduce(
      (total, entry) => total + entry.references.length,
      0
    );

    if (!apply) {
      console.log(
        JSON.stringify({
          apply: false,
          legacyImageCount: referenceCount,
          storyCount: entries.length
        })
      );
      return;
    }

    if (!publicBaseUrl) {
      throw new Error("R2_PUBLIC_BASE_URL is required when using --apply.");
    }

    const media = new MediaService({
      pool,
      publicBaseUrl,
      storage: createR2ObjectStorageFromEnvironment()
    });

    for (const { references, story } of entries) {
      for (const reference of references) {
        const imageId = await uploadReference(
          media,
          story.owner_id,
          reference
        );
        const scene = story.storyboard.scenes?.[reference.sceneIndex];
        const profile = scene?.[reference.speaker];

        if (profile && typeof profile === "object") {
          (profile as Record<string, unknown>).avatarImageId = imageId;
          (profile as Record<string, unknown>).avatarUrl = "";
          delete (profile as Record<string, unknown>).avatarImage;
        }
      }

      await pool.query(
        `UPDATE stories
         SET storyboard = $1::jsonb, updated_at = NOW()
         WHERE id = $2`,
        [JSON.stringify(story.storyboard), story.id]
      );
    }

    console.log(
      JSON.stringify({
        apply: true,
        migratedImageCount: referenceCount,
        storyCount: entries.length
      })
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "Legacy extraction failed."
  );
  process.exitCode = 1;
});
