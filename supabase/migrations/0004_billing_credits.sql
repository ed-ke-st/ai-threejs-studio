-- Billing: prepaid generation credits + PayPal order tracking.

alter table public.user_settings
  add column if not exists ai_usage_source text not null default 'auto'
    check (ai_usage_source in ('auto', 'platform'));

create table if not exists public.credit_balances (
  user_id          uuid primary key references auth.users (id) on delete cascade,
  paid_credits     integer not null default 0 check (paid_credits >= 0),
  bonus_credits    integer not null default 0 check (bonus_credits >= 0),
  bonus_granted_at timestamptz,
  updated_at       timestamptz not null default now()
);

create table if not exists public.credit_ledger (
  id             text primary key,
  user_id         uuid not null references auth.users (id) on delete cascade,
  credit_type     text not null check (credit_type in ('paid', 'bonus')),
  amount          integer not null,
  reason          text not null,
  reference_id    text,
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

create unique index if not exists credit_ledger_reference_idx
  on public.credit_ledger (user_id, reason, reference_id, credit_type)
  where reference_id is not null;

create table if not exists public.paypal_orders (
  id              text primary key,
  user_id          uuid not null references auth.users (id) on delete cascade,
  package_id       text not null,
  credits          integer not null check (credits > 0),
  amount_cents     integer not null check (amount_cents > 0),
  currency         text not null,
  paypal_order_id  text not null unique,
  paypal_capture_id text,
  status           text not null,
  approval_url     text,
  credited_at      timestamptz,
  raw              jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists credit_ledger_user_created_idx
  on public.credit_ledger (user_id, created_at desc);

create index if not exists paypal_orders_user_created_idx
  on public.paypal_orders (user_id, created_at desc);

create unique index if not exists paypal_orders_capture_idx
  on public.paypal_orders (paypal_capture_id)
  where paypal_capture_id is not null;

alter table public.credit_balances enable row level security;
alter table public.credit_ledger enable row level security;
alter table public.paypal_orders enable row level security;

create policy credit_balances_self_select on public.credit_balances
  for select using (user_id = auth.uid());

create policy credit_ledger_self_select on public.credit_ledger
  for select using (user_id = auth.uid());

create policy paypal_orders_self_select on public.paypal_orders
  for select using (user_id = auth.uid());
