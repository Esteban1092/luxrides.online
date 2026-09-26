create table if not exists public.push_subscriptions (
  id bigint generated always as identity primary key,
  chofer_id text unique,
  subscription jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.push_subscriptions
  alter column chofer_id drop not null;

alter table if exists public.push_subscriptions
  add column if not exists user_id text;

create unique index if not exists idx_push_subscriptions_user_id
  on public.push_subscriptions (user_id);

alter table if exists public.reservas
  add column if not exists payment_status text not null default 'unpaid';

alter table if exists public.reservas
  add column if not exists stripe_payment_intent_id text;
