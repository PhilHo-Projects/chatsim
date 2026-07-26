import { z, type ZodType } from "zod";
import { HttpError } from "./httpError";

const identifier = z.string().trim().min(1).max(160);
const storyboardSchema = z
  .object({
    activeSceneId: z.string().trim().min(1),
    presentationMode: z.enum(["phone", "battle"]).optional(),
    scenes: z.array(z.unknown()).max(10)
  })
  .loose();

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
    displayName: z.string().trim().min(1).max(80).optional()
  })
  .refine(
    (input) =>
      input.avatarImageId !== undefined || input.displayName !== undefined,
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
  .loose();

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
