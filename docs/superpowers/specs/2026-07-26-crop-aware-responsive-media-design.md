# Crop-Aware Responsive Media Design

**Status:** Approved direction; implementation is deferred to the UI/UX overhaul.

## Scope Correction (2026-07-26)

This document was written while investigating slow image loading, but it does
not address that. Slow loading came from delivery, not from cropping:

- Bundled application artwork shipped as full-resolution PNG. Seven story cards
  alone were 18 MB, and one cover was 4.6 MB to paint a 216 px column.
- The origin sent no `Cache-Control`, `ETag`, or `Last-Modified`, so every
  visit re-downloaded every byte.
- Text assets were served uncompressed.
- `chatsim.philippeho.dev` is DNS-only, so all of it came from Helsinki with no
  edge cache.

Those four are fixed, taking the shipped image payload from 28.4 MB to 1.8 MB.
See the Static Asset Delivery section of `CLAUDE.md`. Putting the hostname
behind the Cloudflare proxy remains open and needs a DNS change.

Nothing below changes. Crop-aware media is still the right design for user
uploads; it was simply never the cause of the slowness.

## Goal

Keep every accepted user upload as a private, unchanged original in R2. Store
the user's crop intent as metadata, then generate sanitized, immutable WebP
renditions on the server. The UI selects the smallest suitable rendition for
its current display slot instead of downloading the original.

This extends the production media pipeline; it does not replace R2, Postgres,
or the existing start -> direct PUT -> complete upload flow.

## Separate Cropping From Responsive Sizing

Cropping decides the composition and aspect ratio. Responsive sizing decides
how many pixels the browser needs for a particular layout width and device
pixel ratio.

- All size renditions belonging to one crop use the same composition.
- A smaller screen normally chooses a smaller rendition, not a different crop.
- If two product surfaces genuinely require different aspect ratios, they use
  separate named crop profiles rather than silently cropping per request.
- The initial required crop profile is the square avatar/profile crop.
  Additional card or artwork profiles are introduced only with a UI layout
  that defines their aspect ratio.

## Stored State

Postgres stores crop metadata normalized against the auto-oriented original:

```ts
type CropRectangle = {
  x: number;      // 0..1 from the left
  y: number;      // 0..1 from the top
  width: number;  // 0..1
  height: number; // 0..1
};

type CropProfile = {
  key: "square";
  rectangle: CropRectangle;
  revision: number;
};
```

Normalized coordinates survive changes in original pixel dimensions and avoid
client-specific rounding. The server validates bounds and the required aspect
ratio before processing. The private original remains the authority; a
browser-produced crop is never treated as the source image.

The schema may represent crop profiles as JSON initially, but the API owns
their validation and meaning. Variant keys include a content digest and crop
revision so regenerated objects can remain immutable.

## Upload And Recrop Flow

1. The authenticated client reserves an upload.
2. The browser uploads the original bytes directly to private R2.
3. The crop UI previews the local file and submits normalized crop metadata
   during completion.
4. The server validates the real image and crop, auto-orients the original,
   applies the crop with Sharp, and creates the configured renditions.
5. The server uploads the new renditions, atomically publishes their keys in
   Postgres, and returns the hydrated `ImageReference`.
6. A later recrop regenerates renditions from the same private original. The
   previous ready renditions remain usable until the replacement set is fully
   written and committed, after which old objects are removed.

The current completion endpoint ignores its request body. Implementation will
extend `POST /api/uploads/:id/complete` with an optional
`{ crop: CropProfile }` body while preserving no-body completion for compatible
image kinds. An owner or admin may later replace a crop through
`PATCH /api/images/:id/crops/:key`; a successful response returns the refreshed
ready image reference. Both paths use the same validator and processor.

## Rendition Selection

The existing semantic size names remain the first delivery contract:

| Context | Rendition |
| --- | --- |
| Chat bubble, small avatar, compact profile row | `thumb` |
| Feed/profile/story card | `card` |
| Enlarged preview or full-screen viewer | `full` |

The UI supplies `srcset` and `sizes`, allowing the browser to choose according
to rendered width and device pixel ratio. Public renditions remain WebP files
served through `media.chatsim.philippeho.dev` with immutable cache headers.
Originals are never exposed through the public media domain.

The current processor creates square avatar/profile renditions at 256, 640,
and 1,200 pixels. Artwork currently preserves its aspect ratio at maximum
dimensions of 320, 960, and 1,920 pixels. Those defaults remain until a real UI
surface establishes a reason for another crop profile.

## Failure And Consistency Rules

- Invalid or out-of-bounds crop metadata returns a typed 4xx response.
- Initial processing failure rejects the upload without publishing variants.
- Recrop failure leaves the last ready crop and variants available.
- Only one completion/recrop processing job runs at a time on the current
  4 GB single-replica host.
- Deleting an image removes the private original and every rendition revision.
- Stale unpublished renditions are cleanup candidates and must not be hydrated.

## UI Overhaul Requirement

The disabled picker must not be re-enabled until it performs the full upload
flow and sends crop metadata for square avatar/profile images. The UI may move,
rename, or redesign the picker freely; it depends on the media API contract,
not the current card/editor layout.

Preset application artwork should use the same delivery principles: sensible
pixel dimensions, WebP or AVIF encoding, responsive selection, lazy loading
off screen, and immutable caching. Multi-megabyte source PNGs must not be sent
directly into feed cards.

## Verification

Implementation tests must cover:

- normalized crop validation and orientation-aware coordinates;
- the expected pixels/aspect ratio across all size renditions;
- recropping from the unchanged private original;
- atomic replacement with old variants available until commit;
- immutable versioned URLs and cleanup of superseded objects;
- `srcset` selection in representative mobile and desktop UI tests;
- no original URL appearing in public API responses.
