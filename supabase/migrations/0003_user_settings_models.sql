-- Per-user model selection (code + repair models per provider). NULL = use the
-- server default. Backward-compatible: existing rows keep NULL and behave as before.
alter table public.user_settings
  add column if not exists anthropic_code_model   text,
  add column if not exists anthropic_repair_model text,
  add column if not exists openai_code_model      text,
  add column if not exists openai_repair_model    text;
