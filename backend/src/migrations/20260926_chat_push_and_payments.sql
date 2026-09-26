create table if not exists public.customer_push_subscriptions (
  user_id text primary key,
  subscription jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.reservas
  add column if not exists payment_status text not null default 'unpaid';

alter table if exists public.reservas
  add column if not exists stripe_payment_intent_id text;
