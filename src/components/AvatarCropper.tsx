import { useEffect, useMemo, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import {
  AVATAR_PREVIEW_SIZE,
  clampAvatarPan,
  clampAvatarZoom,
  exportCroppedAvatarDataUrl,
  type Point,
  type Size
} from "../utils/avatarCrop";

type AvatarCropperProps = {
  imageUrl: string;
  label: string;
  onCancel: () => void;
  onConfirm: (avatarUrl: string) => void;
};

export function AvatarCropper({
  imageUrl,
  label,
  onCancel,
  onConfirm
}: AvatarCropperProps) {
  const imageRef = useRef<HTMLImageElement>(null);
  const dragStartRef = useRef<{
    pan: Point;
    pointer: Point;
  } | null>(null);
  const [imageSize, setImageSize] = useState<Size | null>(null);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const baseScale = useMemo(() => {
    if (!imageSize) {
      return 1;
    }

    return Math.max(
      AVATAR_PREVIEW_SIZE / Math.max(imageSize.width, 1),
      AVATAR_PREVIEW_SIZE / Math.max(imageSize.height, 1)
    );
  }, [imageSize]);
  const renderedSize = imageSize
    ? {
        height: imageSize.height * baseScale * zoom,
        width: imageSize.width * baseScale * zoom
      }
    : { height: AVATAR_PREVIEW_SIZE, width: AVATAR_PREVIEW_SIZE };
  const clampedPan = imageSize
    ? clampAvatarPan({
        imageSize,
        pan,
        previewSize: AVATAR_PREVIEW_SIZE,
        zoom
      })
    : pan;

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCancel();
      }
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onCancel]);

  const updatePan = (nextPan: Point) => {
    if (!imageSize) {
      setPan(nextPan);
      return;
    }

    setPan(
      clampAvatarPan({
        imageSize,
        pan: nextPan,
        previewSize: AVATAR_PREVIEW_SIZE,
        zoom
      })
    );
  };

  const updateZoom = (nextZoom: number) => {
    const clampedZoom = clampAvatarZoom(nextZoom);
    setZoom(clampedZoom);

    if (imageSize) {
      setPan(
        clampAvatarPan({
          imageSize,
          pan,
          previewSize: AVATAR_PREVIEW_SIZE,
          zoom: clampedZoom
        })
      );
    }
  };

  const confirmCrop = () => {
    if (!imageRef.current || !imageSize) {
      return;
    }

    onConfirm(
      exportCroppedAvatarDataUrl(imageRef.current, {
        pan: clampedPan,
        previewSize: AVATAR_PREVIEW_SIZE,
        zoom
      })
    );
  };

  return (
    <div
      role="dialog"
      aria-label={`${label} cropper`}
      className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/70 p-5 backdrop-blur-md"
      onClick={onCancel}
    >
      <div
        className="grid w-[min(420px,calc(100vw-32px))] gap-4 rounded-2xl bg-white p-5 text-slate-950 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm font-semibold">{label}</p>
          <button
            type="button"
            aria-label="Cancel avatar crop"
            title="Cancel avatar crop"
            onClick={onCancel}
            className="grid h-9 w-9 place-items-center rounded-full text-slate-600 transition hover:bg-slate-100"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div
          className="mx-auto cursor-grab overflow-hidden rounded-full bg-slate-100 ring-4 ring-slate-200 active:cursor-grabbing"
          style={{
            height: AVATAR_PREVIEW_SIZE,
            width: AVATAR_PREVIEW_SIZE
          }}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            dragStartRef.current = {
              pan: clampedPan,
              pointer: { x: event.clientX, y: event.clientY }
            };
          }}
          onPointerMove={(event) => {
            if (!dragStartRef.current) {
              return;
            }

            updatePan({
              x:
                dragStartRef.current.pan.x +
                event.clientX -
                dragStartRef.current.pointer.x,
              y:
                dragStartRef.current.pan.y +
                event.clientY -
                dragStartRef.current.pointer.y
            });
          }}
          onPointerUp={() => {
            dragStartRef.current = null;
          }}
        >
          <img
            ref={imageRef}
            alt=""
            className="pointer-events-none block select-none"
            draggable={false}
            src={imageUrl}
            style={{
              height: renderedSize.height,
              marginLeft: (AVATAR_PREVIEW_SIZE - renderedSize.width) / 2,
              marginTop: (AVATAR_PREVIEW_SIZE - renderedSize.height) / 2,
              transform: `translate(${clampedPan.x}px, ${clampedPan.y}px)`,
              width: renderedSize.width
            }}
            onLoad={(event) => {
              setImageSize({
                height: event.currentTarget.naturalHeight,
                width: event.currentTarget.naturalWidth
              });
            }}
          />
        </div>

        <label className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-700">
          Zoom
          <input
            aria-label="Avatar crop zoom"
            className="mt-2 w-full accent-slate-950"
            max={3}
            min={1}
            step={0.01}
            type="range"
            value={zoom}
            onChange={(event) => updateZoom(Number(event.target.value))}
          />
        </label>

        <button
          type="button"
          aria-label="Apply avatar crop"
          disabled={!imageSize}
          onClick={confirmCrop}
          className="flex h-11 items-center justify-center gap-2 rounded-full bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          <Check className="h-4 w-4" aria-hidden="true" />
          Apply crop
        </button>
      </div>
    </div>
  );
}
