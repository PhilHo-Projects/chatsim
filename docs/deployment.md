# Chatsim Production Operations

## Current rollout state

The production backend is a parallel greenfield deployment. It does not replace
or delete the legacy `/chatsim` application.

| Resource | Value |
| --- | --- |
| GitHub repository | `PhilHo-Projects/chatsim` |
| Draft PR | `#1` (`codex/backend-data-infra` -> `main`) |
| New application URL | `https://chatsim.philippeho.dev` |
| Coolify application UUID | `q11urabk74uu6o0l09i7hrqa` |
| Application branch | `codex/backend-data-infra` until PR approval |
| Verified runtime commit | `68a4360` |
| Application port | `3000` |
| Application memory limit | `768 MiB` |
| Postgres UUID | `g149qxoyrc0jbtnuzn52dqwm` |
| Postgres version and limit | Postgres 16, `512 MiB` |
| Backup schedule UUID | `z7p1u1jc5iu8syw1vsin0wz7` |
| Backup schedule | Daily full backup at `0 2 * * *` |
| Backup storage UUID | `xbgtul21vu4xl49cxp8x8ld2` |
| Backup bucket | Private `philippeho-coolify-db-backups` |
| Replacement deploy-key UUID | `il3wfg2fqgdgzkpcuh34t5zx` |

The GitHub deploy key is unique to this repository and read-only. The first key
created during setup was revoked and replaced; do not restore or reuse it.
No GitHub webhook is configured, so releases are manual until the approved
main-branch GitHub Actions flow is enabled.

The bootstrap administrator secret has been removed from the application
environment after creating the account. The local credential is stored in
Windows Credential Manager under target `ChatsimProductionAdmin`; no password
is documented in the repository.

## Runtime data

Postgres is the authority for users, hashed sessions, image metadata, stories,
storyboards, and upload audit events. The application container is stateless and
has no app-data mount.

Public seed content lives once in `src/data/platformSeed.json`. Showcase users
have no password hashes and cannot authenticate. `npm run db:seed` may be
repeated safely.

The live media resources are:

- Private originals: `philippeho-chatsim-originals`.
- Public sanitized variants: `philippeho-chatsim-variants`.
- Variant custom domain: `https://media.chatsim.philippeho.dev`.

Both buckets use Standard storage. Their `r2.dev` endpoints are disabled. The
variants bucket is public only through the custom domain, whose ownership and
SSL statuses are active and whose minimum TLS version is 1.2. The application
uses two permanent Object Read & Write credentials, each restricted to exactly
one bucket and stored as hidden, runtime-only Coolify environment variables.

The originals bucket accepts `PUT` and `HEAD` from the production origin and
the two local Vite origins, permits `Content-Type`, exposes `ETag`, and caches
preflight responses for 3,600 seconds. It has a one-day lifecycle expiry for
the `staging/` prefix. The variants bucket accepts `GET` and `HEAD` from those
same origins. The application also reaps pending, processing, or deleting rows
older than 24 hours on upload attempts and every six hours; the R2 lifecycle is
the backstop for objects left behind while the application is offline.

R2 is deliberately not a general health-check dependency. Media routes return
a typed `503 SERVICE_UNAVAILABLE` without leaking configuration details if
storage cannot initialize.

## Local workflow

Copy `.env.example` to a local untracked environment file or load equivalent
variables in the shell. Then:

```powershell
npm ci
npm run dev:db
npm run db:migrate
npm run db:seed
npm test
npm run build
npm run dev -- --port 5174
```

The Compose database listens only on `127.0.0.1:54339`. Use
`npm run dev:db:down` to stop it or `npm run dev:db:reset` to replace only the
dedicated development volume.

The standalone API is `npm run dev:api`; its default container/production port
is `3000`. `GET /api/health` checks Postgres connectivity and migration
readiness.

Production sets `TRUST_PROXY=true` because the container is reachable only
through Coolify/Traefik's private Docker network. The API accepts
`X-Forwarded-For` only from private/loopback peers and uses the rightmost valid
address, preventing a client-supplied leftmost value from bypassing IP limits.
Do not publish port 3000 directly while this setting is enabled.

Rate limiting is intentionally in-process for the current single application
replica. Each limiter bounds tracked identities at 10,000 and fails closed at
capacity. Replace it with a shared limiter before adding replicas or promoting
the service to sustained high public traffic. Image completion is limited to
one active Sharp pipeline per application instance for the current shared
4 GiB host.

## Database migrations, seed, and backup

API startup applies ordered SQL migrations while holding a Postgres advisory
lock. `schema_migrations` records completed files. Migrations must remain
append-only after release.

Useful explicit commands:

```powershell
npm run db:migrate
npm run db:seed
npm run db:bootstrap-admin
```

The one-time bootstrap command requires
`ADMIN_BOOTSTRAP_USERNAME`, `ADMIN_BOOTSTRAP_PASSWORD`, and optionally
`ADMIN_BOOTSTRAP_DISPLAY_NAME`. Remove those values from Coolify immediately
after a successful bootstrap.

Verified backup executions:

- Initial empty backup: `vygxqk2fscznd1adbh2qnn24`.
- Post-seed backup: `fecern9hcc0xhaaaomgzn43j`, uploaded to R2, 20,736 bytes.
- Post-hardening backup: `lpbddnx5kj07bta2pwcfhg2k`, uploaded to R2,
  21,578 bytes.

The latest dump was restored into temporary isolated database
`chatsim_restore_lpbddnx5`. Verification returned 6 migrations, 26 users, and
26 stories. The temporary database and its copied dump were then removed. For
future drills, restore to a new database first, verify migration and row
counts, and never overwrite the live database.

## Deployment

The Dockerfile builds the Vite client, installs production server dependencies
in a separate runtime image, runs as the unprivileged `node` user, and exposes
port 3000. Both the image health check and Coolify use `/api/health`.

Before PR approval:

1. Keep the Coolify app on `codex/backend-data-infra`.
2. Keep the PR draft and direct auto-deploy disabled.
3. Require passing tests, production build, Docker build, and new-stack smoke
   checks.
4. After repository deployment secrets exist, use `workflow_dispatch` to run
   the full verify-and-deploy pipeline against the feature branch.

After PR approval:

1. Merge to `main` and point the Coolify application at `main`.
2. Add repository secrets `COOLIFY_TOKEN` and `COOLIFY_WEBHOOK`. Use a
   deploy-only Coolify token.
3. Keep direct Coolify auto-deploy disabled.
4. Pushes to `main` run tests/build/Docker verification, trigger the Coolify
   webhook with a deploy-only token, and poll
   `https://chatsim.philippeho.dev/api/health` until its `sourceCommit` equals
   the workflow commit.

## Verification completed

- All 23 repository test files pass (178 tests).
- Production TypeScript/Vite build passed.
- Linux Docker build passed.
- `npm audit` reports zero known dependency vulnerabilities.
- New application reports running and healthy.
- Health reports Postgres ready.
- Canonical feed and 25 profiles load; the two feed pages contain 26 stories.
- Registration, login, logout, secure cookie flags, owner permissions, private
  story denial, and admin update/delete passed production smoke tests.
- Application restart preserved the Postgres data.
- Post-hardening backup and isolated restore passed with 6 migrations, 26
  users, and 26 stories.
- The live R2 flow passed reserve, browser CORS preflight for all three allowed
  origins, direct private upload, completion, and cleanup. A 1,254 x 1,254 PNG
  produced 256, 640, and 1,200 pixel WebP variants with immutable one-year
  cache headers through `media.chatsim.philippeho.dev`.
- A temporary private story hydrated the ready avatar image reference. Deleting
  the story and image returned all original, staging, and variant object counts
  to zero, and all three public variant URLs returned `404`.
- A 9.55 MiB, 6,000 x 6,000 JPEG (36 million pixels) completed under the
  768 MiB application limit. The container cgroup recorded a 579.1 MiB peak,
  zero OOM events, zero restarts, and healthy status afterward; the host still
  had 1,361.8 MiB available.
- The daily database backup schedule remains enabled. Its latest checked
  execution succeeded and uploaded to R2.
- The legacy `/chatsim` route still returns successfully.

The backend media pipeline is operational. The existing data-URL/file avatar
controls remain intentionally disabled so the editor cannot report a
successful save while discarding local bytes. The UI overhaul must implement
the documented start -> direct PUT -> complete sequence and then attach the
returned image ID. Hydrated story avatar variants already render through their
public `thumb` URL; dynamic profile/card media rendering remains explicit
follow-up UI work.

## Cutover: completed 2026-07-27

The legacy `/chatsim` stack has been retired. `chatsim.philippeho.dev` is the
only application host.

- `philippeho.dev/chatsim` and `/chatsim/*` now return `301` to
  `https://chatsim.philippeho.dev`, preserving path suffix and query string.
  This is served by `/data/coolify/proxy/dynamic/chatsim.yaml`, rewritten as a
  redirect-only Traefik route (`redirectRegex` + `noop@internal`, no backend).
- The legacy container, image, `/opt/chatsim`, `/home/phil/projects/chatsim`,
  and `/home/phil/projects/chatsim-runtime` were removed.
- Archived with SHA256 checksums at
  `/root/archive/chatsim-legacy-2026-07-27/`: the compose file, the original
  Traefik route, `docker inspect` output, and the final JSON store (last
  written 2026-06-08, so no data was lost).

No explicit `chatsim.philippeho.dev` A record exists; the host resolves through
the existing DNS-only `*.philippeho.dev` wildcard. That wildcard is **not**
proxied, so the origin serves every byte directly from Helsinki with no edge
cache. `media.chatsim.philippeho.dev` is separate: as an R2 custom domain it is
always Cloudflare-proxied.

Putting the application host behind the Cloudflare proxy (an explicit `chatsim`
A record, orange-clouded) remains an open, unapproved option. The locally stored
Cloudflare setup token is R2-scoped and cannot edit DNS; it was also only ever a
provisioning credential. Runtime R2 access uses the bucket-scoped S3 access-key
pairs in Coolify, which do not expire, so letting the setup token lapse breaks
nothing.

Stale branches have not been deleted.

## Rollback

Before cutover, rollback is simply redeploying the prior greenfield application
version or leaving the legacy `/chatsim` route in service.

After an approved cutover, disable the redirect, restore the archived legacy
compose/route if needed, and confirm `/chatsim` before changing the new
application. Database rollback should use a new restored database resource from
the most recent verified backup, then update `DATABASE_URL` and redeploy. Do not
restore destructively over the live Postgres resource.

## Future auth

The schema reserves nullable email and OIDC identity fields, but Google/OIDC is
not implemented. Password registration remains open under the documented rate
limits and password policy.
