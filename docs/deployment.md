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
| Verified runtime commit | `549d13c` |
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

The intended media resources are:

- Private originals: `philippeho-chatsim-originals`.
- Public sanitized variants: `philippeho-chatsim-variants`.
- Variant custom domain: `https://media.chatsim.philippeho.dev`.

These three Cloudflare resources and their two bucket-scoped application
credentials have not been provisioned yet. The local machine has no
authenticated Cloudflare setup credential. The application has the non-secret
bucket names and public base URL, but intentionally does not have R2 access-key
secrets. Health checks remain healthy because R2 is not a health dependency;
the upload flow must not be considered production-ready until the live R2 smoke
test passes.

When provisioning the originals bucket, add a one-day object lifecycle rule for
the `staging/` prefix. The application also reaps pending, processing, or
deleting rows older than 24 hours on upload attempts and every six hours. The
R2 lifecycle is the backstop for objects left behind while the application is
offline.

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

After PR approval:

1. Merge to `main` and point the Coolify application at `main`.
2. Add repository secrets `COOLIFY_TOKEN` and `COOLIFY_WEBHOOK`. Use a
   deploy-only Coolify token.
3. Keep direct Coolify auto-deploy disabled.
4. Pushes to `main` run tests/build/Docker verification, trigger the Coolify
   webhook, poll the returned deployment UUID, and smoke-test
   `https://chatsim.philippeho.dev/api/health`.

## Verification completed

- All 23 repository test files pass (174 tests).
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
- The legacy `/chatsim` route still returns successfully.

The R2 create/upload/complete/read/delete smoke test is pending Cloudflare
provisioning. The existing data-URL/file avatar controls are intentionally
disabled so the editor cannot report a successful save while discarding local
bytes. Hydrated story avatar variants render through their public `thumb` URL;
the secure start/PUT/complete picker and dynamic profile/card media rendering
remain explicit follow-up UI work.

## Approval-gated cutover

Do not perform any of these operations without explicit user approval:

1. Add the explicit DNS-only `chatsim.philippeho.dev` A record.
2. Create the Cloudflare 308 redirect from exact `/chatsim` and
   `/chatsim/*` paths to the new host.
3. Archive, stop, remove, or delete the legacy compose, Traefik route, JSON
   store, source copy, or runtime directories.
4. Delete stale branches.

Before removing the legacy stack, capture root-only checksums of its archive and
verify both new-host routing and the redirect. Preserve query strings and the
path suffix during redirect.

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
