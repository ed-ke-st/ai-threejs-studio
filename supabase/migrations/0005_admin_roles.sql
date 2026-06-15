-- Admin roles for app-owned authorization.
--
-- Keep roles in public.profiles instead of auth.users because auth.users is
-- Supabase-managed. The API still enforces admin access server-side; the trigger
-- below is a defense-in-depth guard for any direct Supabase table access.

alter table public.profiles
  add column if not exists role text not null default 'user'
    check (role in ('user', 'admin'));

create or replace function public.prevent_profile_role_self_promotion()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if old.role is distinct from new.role then
    if coalesce(auth.role(), '') <> 'service_role'
       and current_user not in ('postgres', 'supabase_admin', 'service_role') then
      raise exception 'profile role can only be changed by an administrator';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_profile_role_self_promotion on public.profiles;
create trigger prevent_profile_role_self_promotion
  before update of role on public.profiles
  for each row execute function public.prevent_profile_role_self_promotion();

create index if not exists profiles_role_idx on public.profiles (role);
