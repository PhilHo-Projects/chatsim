import { HttpError } from "./httpError";

type SupportedMimeType = "image/jpeg" | "image/png" | "image/webp";
type Speaker = "contact" | "viewer";

export type LegacyDataUrlReference = {
  body: Buffer;
  mimeType: SupportedMimeType;
  sceneIndex: number;
  speaker: Speaker;
};

const DATA_URL_PATTERN =
  /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/;

export function decodeLegacyDataUrl(value: string) {
  const match = value.match(DATA_URL_PATTERN);

  if (!match || match[2].length % 4 !== 0) {
    throw new HttpError(
      "Legacy image data URL is invalid or unsupported.",
      422,
      "MEDIA_REJECTED"
    );
  }

  const body = Buffer.from(match[2], "base64");

  if (
    body.byteLength === 0 ||
    body.toString("base64").replace(/=+$/, "") !==
      match[2].replace(/=+$/, "")
  ) {
    throw new HttpError(
      "Legacy image data URL is malformed.",
      422,
      "MEDIA_REJECTED"
    );
  }

  return {
    body,
    mimeType: match[1] as SupportedMimeType
  };
}

export function findLegacyDataUrlReferences(
  storyboard: unknown
): LegacyDataUrlReference[] {
  if (!storyboard || typeof storyboard !== "object") {
    return [];
  }

  const scenes = (storyboard as { scenes?: unknown }).scenes;

  if (!Array.isArray(scenes)) {
    return [];
  }

  const references: LegacyDataUrlReference[] = [];

  scenes.forEach((scene, sceneIndex) => {
    if (!scene || typeof scene !== "object") {
      return;
    }

    for (const speaker of ["contact", "viewer"] as const) {
      const profile = (scene as Record<string, unknown>)[speaker];

      if (!profile || typeof profile !== "object") {
        continue;
      }

      const avatarUrl = (profile as { avatarUrl?: unknown }).avatarUrl;

      if (
        typeof avatarUrl !== "string" ||
        !avatarUrl.startsWith("data:")
      ) {
        continue;
      }

      references.push({
        ...decodeLegacyDataUrl(avatarUrl),
        sceneIndex,
        speaker
      });
    }
  });

  return references;
}
