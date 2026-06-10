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

- `NODE_ENV=production` is set in the image, so `PREVIEW_MODE` defaults to **static**
  (previews served through the authed API — no raw ports).
- The image installs **Chromium** and sets `CHROME_BIN_PATH` for visual validation.
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

## Known limits (single-instance, for now)

- **Project files + preview/share bundles live on the `/app/.studio` volume**, so
  run **one** API instance. Horizontal scaling needs object storage (S3/R2) for those
  bundles + serving private previews via signed CDN URLs — the planned next step;
  the static-preview flow already isolates the read/write so only the storage backend
  changes.
- Preview/quota in-flight state is in-process; multi-instance also needs that
  externalized.
- The live preview runner (`PREVIEW_MODE=live`) is for local/single-tenant dev only.
