# Per-user settings (Phase 6) — reference

**DRAFT / reference only.** Phase 6 of `docs/accounts-migration-plan.md`.

## The problem with today's settings in a multi-user world

`LocalSettingsRepository` is a single global `settings.json`, and its resolver makes
**environment variables override stored keys**:

```ts
// getResolvedSettings() today:
geminiApiKey: process.env.GEMINI_API_KEY ?? this.storedSettings.geminiApiKey,
// ...same for openai / anthropic / provider
```

That's correct for a single-operator desktop tool, but wrong once there are accounts:
the platform's shared `ANTHROPIC_API_KEY` would silently become *every* user's key
(everyone generating on your dime, no isolation). Settings must split into two layers.

## Two layers

1. **Platform/system config** — the server's shared provider keys + defaults, from
   env. Used only if policy allows a platform-funded fallback (see decision below).
2. **Per-user preferences** — each user's provider choice and *their own* BYO keys.

## Decision to make first: key policy

- **(a) BYO-only:** users must supply their own provider keys; no platform fallback.
  Simplest cost story, no metering needed. Resolver uses the user's key or errors.
- **(b) Platform fallback + quota:** if a user has no key, fall back to the platform
  key but enforce per-user quotas (ties into `usage_quota`, Phase 5). More product
  value, but you fund usage and must meter it.

The resolver shape below supports both; the policy just changes the fallback line.

## Schema (add to a later migration)

```sql
create table if not exists public.user_settings (
  user_id         uuid primary key references auth.users (id) on delete cascade,
  ai_provider     text not null default 'auto',
  -- API keys are secrets: encrypt at rest (see "Secret storage" below). Do NOT
  -- store plaintext provider keys in a column.
  gemini_api_key     text,
  openai_api_key     text,
  anthropic_api_key  text,
  updated_at      timestamptz not null default now()
);

alter table public.user_settings enable row level security;
create policy user_settings_self on public.user_settings
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
```

## Secret storage (do not skip)

User-supplied provider keys are credentials. Options, least → most effort:
- **App-level encryption**: encrypt with a server-held key (e.g. AES-GCM via Node
  `crypto`, key from `SETTINGS_ENC_KEY` env / a KMS). Store ciphertext in the columns
  above. Decrypt only in-process when calling the provider.
- **Supabase Vault / pgsodium** for at-rest encryption in Postgres.
Never return raw keys to the client — the API already only exposes `hasXApiKey`
booleans via `AppSettings`, so keep that contract.

## Repository shape (`apps/api/src/settings.ts`)

Same surface as `LocalSettingsRepository`, but keyed by user and Postgres-backed:

```ts
getSettings(userId: string): Promise<AppSettings>          // booleans only (existing shape)
getStoredSettings(userId: string): Promise<StoredAppSettings>  // decrypted, server-side use
updateSettings(userId: string, patch: AppSettingsUpdate): Promise<AppSettings>
```

Resolver per policy:

```ts
// (a) BYO-only:
anthropicApiKey: decrypted.anthropicApiKey ?? "",          // empty -> provider errors / prompt user
// (b) Platform fallback:
anthropicApiKey: decrypted.anthropicApiKey || process.env.ANTHROPIC_API_KEY || "",
```

## Ripple

- **`/settings` GET/PUT** are already behind the auth preHandler — pass
  `request.userId` into the repo. No route signature change beyond that.
- **The agent run is the deep one.** `POST /projects/:id/scene3d/agent-run` builds
  generators from settings/config. Today they read global `config` / settings; they
  must instead resolve the **requesting user's** keys (`getStoredSettings(request.userId)`)
  and pass them into the generator construction. Audit `scene3dAgent.ts` /
  `claudeSceneGenerator.ts` / `scene3dGenerator.ts` for where keys/config are read.
- The web settings UI is unchanged in shape (still posts a patch, still shows
  `hasXApiKey` booleans) — it just now reflects the logged-in user.

## Wiring left undone (intentionally plan-only)

- Add the `user_settings` migration + encryption helper.
- Replace `LocalSettingsRepository` with a per-user, Postgres-backed, encrypted repo.
- Thread `request.userId` into `/settings` and into agent-run key resolution.
- Decide key policy (a) vs (b); if (b), connect to `usage_quota` metering (Phase 5).
