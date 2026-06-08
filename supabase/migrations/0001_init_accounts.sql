-- Accounts migration — Phase 1 schema + RLS.
-- DRAFT: not yet applied. See docs/accounts-migration-plan.md.
--
-- Notes:
--  * Existing project ids are nanoid(12) strings (NOT uuids), so projects.id and
--    the share ids stay `text` to let the backfill preserve current ids.
--  * The Fastify API talks to Postgres with the service-role key, which BYPASSES
--    RLS. These policies are a defense-in-depth backstop for any anon/direct
--    access (e.g. if the browser ever queries Supabase directly). Ownership is
--    still enforced in API code via assertOwner.

-- ---------------------------------------------------------------------------
-- profiles: app-facing mirror of auth.users (1:1).
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at   timestamptz not null default now()
);

-- Auto-create a profile row when a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', new.email))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- projects: the Project shape (packages/shared) + owner_id.
-- ---------------------------------------------------------------------------
create table if not exists public.projects (
  id          text primary key,                       -- nanoid(12), preserved on backfill
  owner_id    uuid not null references auth.users (id) on delete cascade,
  name        text not null,
  template_id text not null check (template_id in (
                'blank-r3f-scene', 'glb-viewer', 'product-configurator',
                'room-scene', 'interactive-planner'
              )),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists projects_owner_id_idx on public.projects (owner_id);
create index if not exists projects_owner_updated_idx
  on public.projects (owner_id, updated_at desc);   -- matches listProjects(ownerId) sort

-- ---------------------------------------------------------------------------
-- project_shares: ProjectShare shape. Shares are read-public BY TOKEN through an
-- API route (GET /shares/:shareId) — not via direct table reads.
-- ---------------------------------------------------------------------------
create table if not exists public.project_shares (
  id          text primary key,                       -- nanoid share token
  project_id  text not null references public.projects (id) on delete cascade,
  owner_id    uuid not null references auth.users (id) on delete cascade,
  url         text not null,
  preview_url text,
  created_at  timestamptz not null default now()
);

create index if not exists project_shares_project_id_idx on public.project_shares (project_id);

-- ---------------------------------------------------------------------------
-- usage_quota: per-user metering for agent runs / builds (Phase 5).
-- ---------------------------------------------------------------------------
create table if not exists public.usage_quota (
  user_id        uuid not null references auth.users (id) on delete cascade,
  day            date not null default current_date,
  agent_runs     integer not null default 0,
  builds         integer not null default 0,
  primary key (user_id, day)
);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles       enable row level security;
alter table public.projects       enable row level security;
alter table public.project_shares enable row level security;
alter table public.usage_quota    enable row level security;

-- profiles: a user can see/update only their own profile.
create policy profiles_self_select on public.profiles
  for select using (id = auth.uid());
create policy profiles_self_update on public.profiles
  for update using (id = auth.uid());

-- projects: full CRUD limited to the owner.
create policy projects_owner_all on public.projects
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- project_shares: owner-only management. Public read happens via the API/service role.
create policy project_shares_owner_all on public.project_shares
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- usage_quota: a user can read their own counters; writes go through the service role.
create policy usage_quota_self_select on public.usage_quota
  for select using (user_id = auth.uid());
