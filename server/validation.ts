import { z, type ZodType } from "zod";
import { HttpError } from "./httpError";

const identifier = z.string().trim().min(1).max(160);
const speedLevel = z.number().int().min(1).max(5);
const imageId = identifier.nullable().optional();
const speakerProfile = z
  .object({
    avatarImageId: imageId,
    avatarUrl: z.literal("").optional(),
    initials: z.string().trim().min(1).max(8),
    name: z.string().trim().min(1).max(80),
    status: z.string().trim().max(80)
  })
  .strict();
const messageSchema = z
  .object({
    id: identifier,
    pauseAfterMs: z.number().int().min(0).max(60_000).optional(),
    speaker: z.enum(["viewer", "contact"]),
    text: z.string().max(10_000),
    typingSpeedLevel: speedLevel.optional(),
    useDefaultPauseAfterMs: z.boolean().optional(),
    useDefaultTypingMs: z.boolean().optional()
  })
  .strict();
const sceneSchema = z
  .object({
    contact: speakerProfile.extend({
      typingSpeedLevel: speedLevel
    }),
    createdByUser: z.boolean().optional(),
    defaultPauseAfterMs: z.number().int().min(0).max(60_000),
    defaultSpeakerTypingSpeedLevel: speedLevel,
    id: identifier,
    messages: z.array(messageSchema).max(100),
    sceneTitle: z.string().trim().min(1).max(160),
    viewer: speakerProfile
  })
  .strict();
const storyboardSchema = z
  .object({
    activeSceneId: z.string().trim().min(1),
    createdAt: z.iso.datetime().optional(),
    id: identifier.optional(),
    presentationMode: z.enum(["phone", "battle"]).optional(),
    scenes: z.array(sceneSchema).min(1).max(10),
    title: z.string().trim().min(1).max(160).optional(),
    updatedAt: z.iso.datetime().optional()
  })
  .strict()
  .refine(
    (storyboard) =>
      storyboard.scenes.some((scene) => scene.id === storyboard.activeSceneId),
    "Active scene must exist."
  );

export const registrationSchema = z.object({
  displayName: z.string().trim().min(1).max(80).optional(),
  password: z.string(),
  username: z.string()
});

export const loginSchema = z.object({
  password: z.string(),
  username: z.string()
});

export const userPatchSchema = z
  .object({
    avatarImageId: identifier.nullable().optional(),
    bio: z.string().trim().max(160).nullable().optional(),
    displayName: z.string().trim().min(1).max(80).optional()
  })
  .refine(
    (input) =>
      input.avatarImageId !== undefined ||
      input.bio !== undefined ||
      input.displayName !== undefined,
    "At least one profile field is required."
  );

export const storyPatchSchema = z
  .object({
    coverColor: z.string().trim().min(1).max(64).optional(),
    coverImageId: identifier.nullable().optional(),
    storyboard: storyboardSchema.optional(),
    title: z.string().trim().min(1).max(160).optional(),
    visibility: z.enum(["public", "private"]).optional()
  })
  .strict();

export const uploadRequestSchema = z.object({
  kind: z.enum([
    "avatar",
    "profile",
    "story_cover",
    "scene_art",
    "sprite"
  ]),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  sizeBytes: z.number().int().min(1).max(10 * 1024 * 1024)
});

export function parseInput<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);

  if (!result.success) {
    throw new HttpError("Invalid request body.", 400, "BAD_REQUEST");
  }

  rejectUrlBackedImages(result.data);
  return result.data;
}

function rejectUrlBackedImages(value: unknown): void {
  if (Array.isArray(value)) {
    value.forEach(rejectUrlBackedImages);
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    if (
      key.toLowerCase().endsWith("url") &&
      typeof child === "string" &&
      child.trim()
    ) {
      throw new HttpError(
        "Images must be referenced by image ID.",
        400,
        "BAD_REQUEST"
      );
    }

    if (
      (key === "avatarImage" || key === "coverImage") &&
      child !== null &&
      child !== undefined
    ) {
      throw new HttpError(
        "Images must be referenced by image ID.",
        400,
        "BAD_REQUEST"
      );
    }

    rejectUrlBackedImages(child);
  }
}
