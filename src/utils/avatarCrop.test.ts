import {
  AVATAR_EXPORT_SIZE,
  clampAvatarPan,
  clampAvatarZoom,
  getAvatarCropSourceRect
} from "./avatarCrop";

describe("avatarCrop", () => {
  it("uses a WhatsApp-style 640 square export target", () => {
    expect(AVATAR_EXPORT_SIZE).toBe(640);
  });

  it("clamps zoom to the supported cropper range", () => {
    expect(clampAvatarZoom(0.2)).toBe(1);
    expect(clampAvatarZoom(2)).toBe(2);
    expect(clampAvatarZoom(10)).toBe(3);
  });

  it("keeps pan inside the scaled image bounds", () => {
    expect(
      clampAvatarPan({
        pan: { x: 500, y: -500 },
        imageSize: { width: 1200, height: 800 },
        previewSize: 256,
        zoom: 1
      })
    ).toEqual({ x: 64, y: 0 });
  });

  it("calculates a centered square crop rect from pan and zoom", () => {
    expect(
      getAvatarCropSourceRect({
        pan: { x: 0, y: 0 },
        imageSize: { width: 1200, height: 800 },
        previewSize: 256,
        zoom: 1
      })
    ).toEqual({
      height: 800,
      width: 800,
      x: 200,
      y: 0
    });
  });
});
