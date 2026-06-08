# User Accounts Migration Plan

Plan for adding multi-tenant user accounts before a public deployment.
**Status:** planning only — no implementation yet.

## Decisions locked in

- **Auth + DB:** Supabase (Supabase Auth for identity, Supabase Postgres for metadata).
- **Storage scope for v1:** minimal — metadata moves to Postgres; project **files/blobs stay
  on the host filesystem** (persistent volume) for now. Object storage (S3/R2) is deferred.
- **Live preview runner (vite + headless Chrome spawner):** decision deferred. Treat as
  single-tenant/dev-only until revisited (see "Open decisions").

## Why this is more than a login page

The app is currently single-tenant with **no identity on any route**:

- `Project` (packages/shared) has no owner. `LocalProjectRepository` is an in-memory `Map`
  flushed to `.studio/projects.json` — not safe across >1 server instance.
- Every route is globally scoped. `GET /projects` returns all projects; `GET/PUT
  /projects/:id/*` read/mutate by id with no ownership check. Project ids are guessable
  nanoids. On a public URL this is a full cross-tenant data leak.
- `PreviewRunner` spawns real `vite` + Chrome child processes per project — host-bound,
  stateful, and a sandbox surface if exposed to arbitrary users.
- Provider API keys (Anthropic/OpenAI/Gemini) are server-side and shared across all callers
  — uncontrolled cost/abuse once anyone can hit `/agent-run`.

The core change is **ownership scoping on every project route**. Everything else follows.

## Architecture: API stays the gateway

The Fastify API must remain the single gateway (it owns the filesystem workspace, preview
processes, and AI agent orchestration — none of which can move into Supabase). So:

- Frontend authenticates with **Supabase Auth** via `@supabase/supabase-js`, receives a JWT.
- Frontend attaches the access token (`Authorization: Bearer <jwt>`) to every `/api` call.
- Fastify **verifies the Supabase JWT** in a `preHandler` and resolves `request.userId`.
- Fastify talks to **Supabase Postgres** for metadata (service-role connection), enforcing
  ownership in code (`assertOwner`).
- **Row Level Security (RLS)** is enabled as a defense-in-depth backstop, not the primary
  gate. (We do *not* let the browser query project metadata directly — it goes through the API.)

> JWT verification note: newer Supabase projects sign access tokens asymmetrically (RS256/ES256).
> Verify via the project JWKS endpoint (`/auth/v1/.well-known/jwks.json`) using `jose`. Legacy
> projects use an HS256 shared secret (`SUPABASE_JWT_SECRET`). Prefer JWKS.

## Phased work

### Phase 0 — Supabase project setup (no app code)
- Create the Supabase project. Enable email/password auth + chosen OAuth providers.
- Capture: `SUPABASE_URL`, anon key (frontend), service-role key (API), JWKS URL.
- Add them to `.env` and `apps/api/src/config.ts` (+ `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`
  for the web app).

### Phase 1 — Schema + RLS (SQL migrations)
Tables (Postgres):
- `profiles` — mirrors `auth.users` (id uuid PK = auth uid, display name, created_at).
- `projects` — move the `Project` shape here: `id`, `owner_id` (uuid → auth.users), `name`,
  `template_id`, `created_at`, `updated_at`. Index on `owner_id`.
- `project_shares` — `id`, `project_id`, `owner_id`, `url`, `preview_url?`, `created_at`.
- `usage_quota` (optional, for Phase 5) — per-user agent-run counters / limits.

RLS: `owner_id = auth.uid()` policies on `projects` / `project_shares`. Shares are read-public
by token via an API route, not by direct table access.

### Phase 2 — API auth layer (`apps/api`)
- `config.ts`: add Supabase URL / service-role key / JWKS URL.
- New `auth/` module: a Fastify `preHandler` that verifies the bearer JWT (jose + JWKS),
  sets `request.userId`, returns 401 when missing/invalid.
- Type augmentation for `FastifyRequest.userId`.
- **Public routes (no auth):** `/health`, `/shares/:shareId` and `/shares/:shareId/*`
  (token-gated public bundles). Everything else requires auth.

### Phase 3 — Ownership data model
- `packages/shared`: add `ownerId: string` to `Project`.
- `projects.ts`: replace the JSON-file `Map` repo with a Postgres-backed repo (keep the class
  interface; swap the implementation). `createProject({ ...input, ownerId })`,
  `listProjects(ownerId)`, and a new `assertOwner(projectId, userId)`.
- `routes.ts`: pull `request.userId`; scope `GET /projects` to the owner; call `assertOwner`
  at the top of **every** `/projects/:id*` route — files, scene3d, scene3d/agent-run, assets,
  snapshots, preview, build, export, share. Return **404 (not 403)** on mismatch so existence
  isn't leaked.
- **Backfill:** existing `.studio/projects.json` records have no owner. Write a one-time script
  that seeds a dev/owner account and assigns existing projects to it, inserting rows into
  Postgres. (Keep test artifacts — do not wipe; see memory note.)

### Phase 4 — Frontend auth (`apps/web`)
- Add `@supabase/supabase-js`; create a Supabase client from `VITE_SUPABASE_*`.
- Login/signup UI; session handling (Supabase persists + refreshes tokens).
- `stores/projectStore.ts`: the `api()` helper attaches `Authorization: Bearer <token>`;
  on 401 → sign out / redirect to login. (Vite dev proxy to `:4000` is unchanged.)

### Phase 5 — Cost & abuse controls (before opening to the public)
- Per-user rate limit + quota on `/agent-run` (and build/preview).
- Usage metering (count generations per user/day) in `usage_quota`.
- Optional: BYO provider key per user so generation cost isn't all on us.

### Phase 6 — Per-user settings
- `LocalSettingsRepository` (`.studio/settings.json`) is currently global. Split into global
  system config vs per-user preferences, or move user prefs into a `profiles`/`settings` table.

## Open decisions (parked)

1. **Live preview runner in hosted multi-user.** Options: (a) disable the live vite/Chrome
   spawner in hosted mode and rely on static share bundles (safest/cheapest); (b) keep it but
   sandbox per-user (containers + resource caps — real infra + security surface). Until decided,
   keep live preview dev/single-tenant only; static shares are the public path.
2. **Object storage.** When traffic justifies it, move project files / embedded textures /
   asset uploads to S3/R2 and drop the persistent-volume dependency (enables horizontal scaling).
3. **Filesystem namespacing.** Optional `.studio/projects/<userId>/<projectId>` layout for
   cleaner per-user quota/export/delete. Not required since ownership is enforced at the API.

## Deployment shape (implied)
- Not serverless: the filesystem workspace + spawned preview processes need a long-lived
  container with a persistent volume.
- Single API instance for v1 (in-memory preview session map + local files). Multi-instance
  requires Phase "object storage" + moving preview-session state out of memory.
