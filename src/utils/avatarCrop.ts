export const AVATAR_EXPORT_SIZE = 640;
export const AVATAR_PREVIEW_SIZE = 256;
export const MIN_AVATAR_ZOOM = 1;
export const MAX_AVATAR_ZOOM = 3;

export type Point = {
  x: number;
  y: number;
};

export type Size = {
  height: number;
  width: number;
};

export type AvatarCropOptions = {
  imageSize: Size;
  pan: Point;
  previewSize: number;
  zoom: number;
};

export type AvatarCropRect = {
  height: number;
  width: number;
  x: number;
  y: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function cleanZero(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}

function getBaseScale(imageSize: Size, previewSize: number): number {
  return Math.max(
    previewSize / Math.max(imageSize.width, 1),
    previewSize / Math.max(imageSize.height, 1)
  );
}

export function clampAvatarZoom(value: number): number {
  if (!Number.isFinite(value)) {
    return MIN_AVATAR_ZOOM;
  }

  return clamp(value, MIN_AVATAR_ZOOM, MAX_AVATAR_ZOOM);
}

export function clampAvatarPan(options: AvatarCropOptions): Point {
  const zoom = clampAvatarZoom(options.zoom);
  const baseScale = getBaseScale(options.imageSize, options.previewSize);
  const renderedWidth = options.imageSize.width * baseScale * zoom;
  const renderedHeight = options.imageSize.height * baseScale * zoom;
  const maxX = Math.max(0, (renderedWidth - options.previewSize) / 2);
  const maxY = Math.max(0, (renderedHeight - options.previewSize) / 2);

  return {
    x: cleanZero(Math.round(clamp(options.pan.x, -maxX, maxX))),
    y: cleanZero(Math.round(clamp(options.pan.y, -maxY, maxY)))
  };
}

export function getAvatarCropSourceRect(
  options: AvatarCropOptions
): AvatarCropRect {
  const zoom = clampAvatarZoom(options.zoom);
  const pan = clampAvatarPan({ ...options, zoom });
  const baseScale = getBaseScale(options.imageSize, options.previewSize);
  const scaledPreview = baseScale * zoom;
  const sourceSize = options.previewSize / scaledPreview;
  const centerX = options.imageSize.width / 2 - pan.x / scaledPreview;
  const centerY = options.imageSize.height / 2 - pan.y / scaledPreview;
  const x = clamp(centerX - sourceSize / 2, 0, options.imageSize.width - sourceSize);
  const y = clamp(centerY - sourceSize / 2, 0, options.imageSize.height - sourceSize);

  return {
    height: Math.round(sourceSize),
    width: Math.round(sourceSize),
    x: Math.round(x),
    y: Math.round(y)
  };
}

export function exportCroppedAvatarDataUrl(
  image: HTMLImageElement,
  options: Pick<AvatarCropOptions, "pan" | "previewSize" | "zoom">
): string {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Canvas is unavailable");
  }

  canvas.width = AVATAR_EXPORT_SIZE;
  canvas.height = AVATAR_EXPORT_SIZE;

  const cropRect = getAvatarCropSourceRect({
    ...options,
    imageSize: {
      height: image.naturalHeight,
      width: image.naturalWidth
    }
  });

  context.drawImage(
    image,
    cropRect.x,
    cropRect.y,
    cropRect.width,
    cropRect.height,
    0,
    0,
    AVATAR_EXPORT_SIZE,
    AVATAR_EXPORT_SIZE
  );

  const webp = canvas.toDataURL("image/webp", 0.88);
  return webp.startsWith("data:image/webp")
    ? webp
    : canvas.toDataURL("image/png");
}
