-- Accounts migration — Phase 6: per-user settings.
-- DRAFT: not yet applied. See docs/accounts/per-user-settings-sketch.md.
--
-- Provider API keys are stored ENCRYPTED at rest (AES-256-GCM, app-level, keyed
-- by SETTINGS_ENC_KEY). The columns hold base64(iv ‖ tag ‖ ciphertext) — never
-- plaintext. The API decrypts only in-process when calling a provider.

create table if not exists public.user_settings (
  user_id           uuid primary key references auth.users (id) on delete cascade,
  ai_provider       text not null default 'auto'
                      check (ai_provider in ('gemini', 'openai', 'claude', 'auto')),
  gemini_api_key     text,   -- encrypted blob (base64) or null
  openai_api_key     text,   -- encrypted blob (base64) or null
  anthropic_api_key  text,   -- encrypted blob (base64) or null
  updated_at        timestamptz not null default now()
);

alter table public.user_settings enable row level security;

-- Owner-only. The API uses the service role (bypasses RLS); this is the backstop.
create policy user_settings_self on public.user_settings
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
