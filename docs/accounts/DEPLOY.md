# Deploying ai-threejs-studio (multi-tenant)

The honest current shape: **single API container + Supabase Postgres + a static web
host**, with project files on a persistent volume until they move to object storage.

## Topology

```
Browser ──> Web (static dist on a CDN / static host: Vercel, Netlify, Cloudflare Pages)
   │            │  VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY baked at build time
   │            └─ /api/* routed to ──┐
   ▼                                  ▼
Supabase Auth (login)          API container (this Dockerfile)
                                  ├─ verifies Supabase JWT (JWKS)
                                  ├─ Postgres via SUPABASE_DB_URL (Supabase)
                                  ├─ builds user projects (vite/tsc) + Chromium visual validation
                                  └─ serves static previews/shares from /app/.studio (volume)
```

- **Web** is a static build — host it on a CDN/static host. At build time it needs
  `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Route `/api/*` from the web host
  to the API container (rewrite that strips `/api`, mirroring the dev Vite proxy).
- **API** is the container below. Not serverless (long-lived, spawns processes,
  writes the workspace).
- **Postgres** is Supabase (already used).

## API container

```bash
docker build -t ats-api .
docker run -p 4000:4000 \
  -v ats-studio:/app/.studio \
  -e SUPABASE_URL=...        -e SUPABASE_DB_URL=...        \
  -e SETTINGS_ENC_KEY=...    -e SUPABASE_SERVICE_ROLE_KEY=... \
  -e ALLOW_PLATFORM_KEYS=false \
  ats-api
```

- `NODE_ENV=production` is set in the image, so `PREVIEW_MODE`/`BLOB_BACKEND`/
  `WORKSPACE_BACKEND` default to **static / supabase / blob** (previews served through
  the authed API; projects + bundles in object storage). ⚠️ If you pass the repo `.env`
  via `--env-file`, it will override these back to dev/localhost — also set
  `-e NODE_ENV=production -e API_HOST=0.0.0.0` (otherwise the app binds localhost inside
  the container and the port mapping can't reach it). Prefer explicit `-e` vars in prod.
- The image installs **Chromium** and sets `CHROME_BIN_PATH` for visual validation.
- Validated: `docker build .` is clean and the container boots in prod mode + builds
  and serves a project from Supabase Storage end-to-end.
- It is **not** a slim image on purpose: the API runs `vite`/`tsc` at runtime to
  build user projects, so the toolchain + dev deps stay in the image.
- Apply the migrations once against `SUPABASE_DB_URL` (see RUNBOOK.md).

## Tunables

| Env | Default | Purpose |
|---|---|---|
| `PREVIEW_MAX_CONCURRENT` | 4 | concurrent live previews (live mode) |
| `PREVIEW_IDLE_TIMEOUT_MS` | 300000 | idle preview reaper |
| `BUILD_MAX_CONCURRENT` | 2 | concurrent vite builds + visual validations |
| `QUOTA_AGENT_RUNS_PER_DAY` | 100 | per-user/day generation cap |
| `QUOTA_BUILDS_PER_DAY` | 200 | per-user/day build cap |

## Object storage

Both the **served bundles** (shares, assets, static preview dist) AND the **project
workspace source** go through a `BlobStore`: `BLOB_BACKEND=supabase` uses Supabase
Storage (bucket `SUPABASE_STORAGE_BUCKET`, default `studio`, via
`SUPABASE_SERVICE_ROLE_KEY`), `local` uses disk. `WORKSPACE_BACKEND=blob` makes the
workspace source canonical in object storage; builds hydrate a temp dir under
`/app/.studio/tmp` (must be inside the app so the project's `node_modules` resolves).
Both default to the object-storage path in production. So **any instance can serve or
build any project** — no per-instance disk state for projects.

| Env | Default | Purpose |
|---|---|---|
| `BLOB_BACKEND` | supabase (prod) / local | object-storage backend |
| `WORKSPACE_BACKEND` | blob (prod) / local | workspace source backend |
| `SUPABASE_STORAGE_BUCKET` | studio | bucket name |

## Serving / CDN

Bundle bytes skip the API: the small entry `index.html` streams through the API (so
relative asset paths resolve back to it), but bundle sub-files (JS/CSS) and asset
downloads **302-redirect to a short-lived signed Storage URL** — ownership is checked
at the API before each redirect, and the heavy bytes come straight from Supabase
Storage's CDN. Local storage streams everything (no signed URLs).

## Known limits

- **Preview/quota in-flight state is in-process** (the live-preview session map; the
  quota counters are in Postgres and fine). For >1 instance, live preview is off
  anyway (static mode), so this mainly means a build runs per instance until a CDN/
  shared cache fronts the bundles. Externalizing remaining in-memory state is the
  last item before comfortable multi-instance.
- `/app/.studio/tmp` is scratch (hydrated build dirs, auto-cleaned); a volume is
  optional now that projects live in object storage, but still useful for the RAG
  index and any `local`-backend data.
- The live preview runner (`PREVIEW_MODE=live`) is for local/single-tenant dev only.
