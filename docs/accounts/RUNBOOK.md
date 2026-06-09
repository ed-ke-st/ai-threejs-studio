# Accounts runbook — enable & validate multi-tenant

How to switch the app from single-tenant to multi-tenant (Supabase) and verify it.
This reflects what actually worked when enabling it the first time (2026-06-09),
gotchas included. The code is **gated**: with the Supabase env unset the app runs
single-tenant exactly as before; setting it enables accounts.

Prereqs on the machine: `psql` (libpq), `openssl`, Node 22, pnpm.

## 1. Supabase project settings

- **Auth → JWT keys:** use the **asymmetric signing keys** (ES256/RS256). The API
  verifies via JWKS; this is the modern, no-shared-secret path. (HS256 legacy still
  works via fallback, but prefer signing keys.)
- **Database → Data API:** not used by this app (browser only calls Auth; the API
  uses a direct Postgres connection). Safe to leave on (tables are RLS-protected) or
  off. **Disable "auto-expose new tables"; enable "automatic RLS".**
- **Auth → Email:** new projects have **"Confirm email" ON**. That blocks the public
  signup path from returning a session, and the email validator rejects fake/MX-less
  domains (example.com, made-up domains). See step 4 for how to confirm without email.

## 2. Environment (`.env` at the monorepo root)

```
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_ANON_KEY=<publishable key (sb_publishable_…) or legacy anon>
SUPABASE_DB_URL=postgresql://postgres.<ref>:<db-pw>@<host>:5432/postgres   # SESSION pooler (5432)
SETTINGS_ENC_KEY=<openssl rand -hex 32>     # required when auth is on; encrypts per-user keys
VITE_SUPABASE_URL=<same as SUPABASE_URL>
VITE_SUPABASE_ANON_KEY=<same as SUPABASE_ANON_KEY>
# optional
SUPABASE_SERVICE_ROLE_KEY=<service_role or sb_secret_…>   # only for admin/test user creation
ALLOW_PLATFORM_KEYS=false                                  # false = BYO-only (recommended)
QUOTA_AGENT_RUNS_PER_DAY=100
QUOTA_BUILDS_PER_DAY=200
```

Notes / gotchas:
- Use the **Session pooler** connection string (port **5432**), NOT the transaction
  pooler (6543) — `postgres.js` uses prepared statements the transaction pooler rejects.
- `SUPABASE_SERVICE_ROLE_KEY` is **not consumed by the app** — only used here for admin
  test-user creation. The browser never sees it (only `VITE_`-prefixed vars are bundled).
- Auth turns on only when BOTH `SUPABASE_URL` and `SUPABASE_DB_URL` are set. The server
  fails fast at startup if accounts are on but `SETTINGS_ENC_KEY` is missing.
- **Restart both dev servers** after editing `.env`. The API reads root `.env` (dotenv);
  Vite reads it via `envDir` (configured in apps/web/vite.config.ts) — without that it
  would look in apps/web and the login screen never shows.

## 3. Apply migrations

```bash
DB=$(grep -E '^SUPABASE_DB_URL=' .env | cut -d= -f2-)
psql "$DB" -v ON_ERROR_STOP=1 --single-transaction -f supabase/migrations/0001_init_accounts.sql
psql "$DB" -v ON_ERROR_STOP=1 --single-transaction -f supabase/migrations/0002_user_settings.sql
# verify
psql "$DB" -tAc "select tablename, rowsecurity from pg_tables where schemaname='public' order by 1;"
```
Expect: profiles, project_shares, projects, usage_quota, user_settings — all `rowsecurity=t`.

## 4. Create the owner account

Sign up through the app (you own the password), then confirm without the inbox:

```bash
DB=$(grep -E '^SUPABASE_DB_URL=' .env | cut -d= -f2-)
EMAIL=you@example.com
psql "$DB" -tAc "update auth.users set email_confirmed_at=coalesce(email_confirmed_at,now()) where email='$EMAIL';"
psql "$DB" -tAc "select id from auth.users where email='$EMAIL';"   # -> BACKFILL_OWNER_ID
```

(Alternative: turn off "Confirm email" in Auth settings while developing.)

## 5. Backfill existing single-tenant projects

Adopts the projects in `.studio/projects.json` under the owner, preserving ids so the
on-disk workspaces still match. Idempotent.

```bash
DB=$(grep -E '^SUPABASE_DB_URL=' .env | cut -d= -f2-)
SUPABASE_DB_URL="$DB" BACKFILL_OWNER_ID=<owner uuid> node --import tsx scripts/backfill-projects.ts
```

## 6. Validate (curl)

Get a token (admin path needs `SUPABASE_SERVICE_ROLE_KEY`; creates a pre-confirmed user):
```bash
URL=$(grep -E '^SUPABASE_URL=' .env|cut -d= -f2-); KEY=$(grep -E '^SUPABASE_ANON_KEY=' .env|cut -d= -f2-)
SECRET=$(grep -E '^SUPABASE_SERVICE_ROLE_KEY=' .env|cut -d= -f2-)
EMAIL="qa-$(date +%s)@example.com"; PW="Test-$(openssl rand -hex 10)"
curl -s -X POST "$URL/auth/v1/admin/users" -H "apikey: $SECRET" -H "Authorization: Bearer $SECRET" \
  -H 'content-type: application/json' -d "{\"email\":\"$EMAIL\",\"password\":\"$PW\",\"email_confirm\":true}" >/dev/null
TOKEN=$(curl -s -X POST "$URL/auth/v1/token?grant_type=password" -H "apikey: $KEY" \
  -H 'content-type: application/json' -d "{\"email\":\"$EMAIL\",\"password\":\"$PW\"}" \
  | node -pe "JSON.parse(require('fs').readFileSync(0)).access_token")
```

Checklist (API on :4000):
- `GET /projects` no token → **401**; with `Authorization: Bearer $TOKEN` → **200**.
- `POST /projects` → row in `projects` with `owner_id` = token `sub`.
- Another user `GET`ting that project id → **404** (not 403).
- `PUT /settings` a key → `select … from user_settings` shows **ciphertext** (no plaintext).
- Pin quota (`update usage_quota set agent_runs=<limit>`) → `agent-run` → **429**, no model call.

Cleanup test users: `delete from auth.users where email like 'qa-%';` (cascades their rows);
remove any `.studio/projects/<id>` dirs they created.

## 7. Revert to single-tenant

Comment out `SUPABASE_*` and `VITE_SUPABASE_*` in `.env`, restart both dev servers.
Local JSON repo + no login return; existing projects reappear.

## Operational notes

- **BYO keys:** with `ALLOW_PLATFORM_KEYS=false`, every user (including you) must enter
  their own provider key in the app **Settings** panel — the server `.env` keys are
  ignored in multi-tenant mode. Stored AES-256-GCM encrypted under their account.
- **Test tokens later:** set `ALLOW_PLATFORM_KEYS=true` and lower `QUOTA_*` to let
  keyless users run on the platform key, capped per user/day.
- **Still single-instance:** project files live on the local disk and preview/quota
  session state assumes one API process. Object storage + moving preview state out of
  memory are required before horizontal scaling. The live preview runner is not yet
  hardened for hostile multi-user use.
