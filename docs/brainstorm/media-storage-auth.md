# Media Storage, Auth, And Upload Safety Brainstorm

Date: 2026-06-03

Living note for future work on image uploads, Cloudflare R2, account auth, and basic abuse guardrails for Story.

## Current Context

Story is still a cute chat/story simulator, not a media platform. The app currently stores users, sessions, and story JSON through the small local Node API and file-backed store. Dialogues are strings inside storyboard JSON and are tiny compared with images.

The next serious production-shaped step is to keep story data in a database and move uploaded image bytes out of the app server entirely.

## Image Usage Shape

Likely image types:

- Profile/storybook picture.
- Story cover picture.
- Speaker avatars for people inside a story.
- Possible future alternate story formats, such as a Pokemon battle-style presentation, using character sprites or scene art.

Realistic early scale:

- 2 to 10 users would already be a pleasant surprise.
- If 10 users each make 5 stories, that is about 50 stories.
- At roughly 1 profile image, 1 cover per story, and 2 avatars per story, that is about 160 images.

Approximate storage:

```txt
160 images x 5 MB = 800 MB
160 images x 10 MB = 1.6 GB
```

Even with originals plus compressed display variants, this is likely still well under 10 GB.

Approximate 10 GB thresholds:

```txt
5 MB average image = about 2,000 images
10 MB average image = about 1,000 images
2 MB average image = about 5,000 images
```

With the rough "5 stories per user" shape, 10 GB probably starts to matter only around 60 to 125 active users if originals are kept. If images are compressed and originals are discarded or retained selectively, the threshold moves higher.

## Cloudflare R2 Takeaway

Use object storage for image bytes. Do not store uploaded images on the EC2/VPS filesystem and do not put base64 image blobs into the story JSON/database.

Cloudflare R2 is attractive because its Standard tier currently includes:

- 10 GB-month storage free.
- Free internet egress.
- Monthly free request allowances.
- Low per-GB storage pricing after the free tier.

At expected early usage, R2 would probably cost $0/month for storage. If the app somehow crosses the free tier, the cost is still small compared with running servers.

Important distinction:

- R2 is object storage.
- Cloudflare Images is a separate image management product with different pricing and features.

Useful references:

- Cloudflare R2 pricing: https://developers.cloudflare.com/r2/pricing/
- Cloudflare Images direct creator upload: https://developers.cloudflare.com/images/storage/upload-images/direct-creator-upload/
- AWS S3 presigned upload docs: https://docs.aws.amazon.com/AmazonS3/latest/userguide/PresignedUrlUploadObject.html

## Recommended Image Architecture

Store only metadata in the app database:

```txt
image_id
owner_id
kind: profile | story_cover | avatar | scene_art | sprite
object_key
mime_type
width
height
size_bytes
status: uploading | processing | ready | rejected | deleted
variant_keys
created_at
updated_at
```

Upload flow:

1. User signs in.
2. Frontend asks the API to start an upload.
3. API checks auth, quota, file type, file size, and intended usage.
4. API returns a one-time signed/direct upload URL.
5. Browser uploads directly to R2.
6. API records metadata and marks the image as uploaded or processing.
7. Server/worker generates compressed variants.
8. App serves only optimized variants through CDN/public read URLs.
9. Originals stay private, are retained only if useful, or are deleted after processing.

Suggested variants:

```txt
avatar/thumb: 30-100 KB
story card/feed: 100-400 KB
full display: 500 KB-1.5 MB
original: private, optional
```

This keeps the app server out of the bandwidth path and prevents tiny UI elements from loading multi-megabyte originals.

## Auth And Google Sign-In Notes

OAuth and auth are related but not identical:

- OAuth is mainly a permission/delegation system.
- OpenID Connect sits on OAuth and provides login/identity.
- "Sign in with Google" for this app should use OpenID Connect for identity only.

For Story, request only minimal login scopes:

```txt
openid
email
profile
```

The app should not request Gmail, Drive, Photos, Calendar, Contacts, or other Google API access.

Google login can give the server:

```txt
google_sub: stable Google account identifier
email
email_verified
name
picture
```

Use `sub` as the stable provider identity. Email can change.

Why Google auth helps:

- Easier signup/login for users.
- No need to store passwords for Google users.
- Better abuse trail than anonymous uploads.
- Upload records can link to a verified identity provider account plus IP/session logs.

What it does not do:

- It does not give the app the user's Google password.
- It does not prove the real-world human identity by itself.
- It does not replace moderation or upload safety.

Possible account model:

```txt
users
  id
  display_name
  username
  auth_provider: password | google
  provider_subject
  email
  email_verified
  role
  created_at
```

For a future iOS app, if Google sign-in is offered, Apple may require an equivalent Sign in with Apple option.

Useful references:

- Google OpenID Connect: https://developers.google.com/identity/openid-connect/openid-connect
- Google OAuth verification overview: https://support.google.com/cloud/answer/13463073
- Apple App Review Guidelines: https://developer.apple.com/app-store/review/guidelines/

## Upload Safety Notes

The app should avoid becoming an open media host.

MVP policy direction:

- No anonymous image uploads.
- No explicit sexual images in public uploads.
- Images are for profiles, story covers, avatars, sprites, or scene art.
- Keep raw uploads private until accepted/processed.
- Add max file size and allowed MIME types.
- Strip EXIF/location metadata.
- Generate safe compressed variants.
- Add report, admin delete, and admin ban tools.
- Keep upload audit logs.

Audit log fields:

```txt
user_id
provider_subject
email_at_upload
ip_address
user_agent
image_id
object_key
action: upload_started | upload_completed | rejected | deleted | reported
created_at
```

For suspected CSAM or other severe illegal content, do not casually inspect, download, screenshot, forward, or share it. Lock access, preserve relevant logs/metadata, report through the proper channel, and get legal advice if this ever happens in reality.

References:

- NCMEC CyberTipline: https://www.ncmec.org/gethelpnow/cybertipline
- 18 USC 2258A provider reporting/preservation duties: https://uscode.house.gov/view.xhtml?edition=prelim&num=0&req=granuleid%3AUSC-prelim-title18-section2258A
- 18 USC 2252A: https://uscode.house.gov/view.xhtml?edition=prelim&f=treesort&jumpTo=true&num=0&req=%28title%3A18+section%3A2252A+edition%3Aprelim%29+OR+%28granuleid%3AUSC-prelim-title18-section2252A%29

## Portfolio-Grade Infra Story

The impressive version is not overbuilt. It is cheap, clear, secure, and explainable:

- App server handles API and auth, not image delivery.
- Postgres stores users, stories, image metadata, and audit logs.
- R2 stores image bytes.
- Signed uploads keep storage credentials off the client.
- Image variants keep the app fast.
- Authenticated uploads and logs make abuse response possible.
- The architecture can scale from 1 user to many users without a rewrite.

Avoid premature cosplay:

- No Kubernetes yet.
- No microservice split yet.
- No Kafka/queue maze yet.
- No multi-region database yet.
- No AI moderation pipeline before there is real usage pressure.

## Suggested Next Work

Recommended order:

1. Move the local file-backed store to Postgres or a Postgres-compatible hosted option.
2. Add Google OpenID Connect login while keeping current password auth available during transition.
3. Add R2 bucket configuration and server-side signed upload endpoint.
4. Add image metadata records and upload audit logs.
5. Add image processing for avatar/card/full variants.
6. Wire profile pictures, story covers, and speaker avatars to uploaded image records.
7. Add basic admin moderation: list uploads, delete image, ban user, view audit trail.
8. Add a small architecture section to the README for portfolio/demo clarity.

Lower-effort first slice:

1. Create R2 bucket and env vars.
2. Add one upload endpoint for profile/story cover images.
3. Store image metadata in the existing local store temporarily.
4. Serve optimized image URLs in the existing profile/story UI.
5. Migrate to Postgres after the shape is proven.

## Open Questions

- Should Google login be required for all accounts or only for image uploads?
- Should password signup remain available long-term?
- Should originals be kept after variants are generated?
- Should uploaded images be private until admin-approved, or only private until automated processing succeeds?
- Should the first upload target be profile images, story cover images, or speaker avatars?
- Should alternate story formats, such as Pokemon battle-style scenes, use the same image asset table with a different `kind`?
