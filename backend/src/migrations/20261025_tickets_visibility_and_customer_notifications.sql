-- LuxRides: visibilidad de tickets + notificaciones automaticas al cliente
-- Idempotente: se puede ejecutar varias veces sin problema.

-- 1) Tickets: ocultar a los clientes sin perder el historial de canjes
alter table if exists public.mayahuel_promotions
  add column if not exists is_public boolean not null default true;

-- 2) Push del cliente: ligar la suscripcion al correo de su reserva
create table if not exists public.customer_push_subscriptions (
  user_id text primary key,
  subscription jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.customer_push_subscriptions
  add column if not exists email text;

create index if not exists idx_customer_push_subscriptions_email
  on public.customer_push_subscriptions (email);

-- 3) Registro anti-spam: cada aviso se reclama una sola vez por reserva
create table if not exists public.customer_notification_log (
  id bigint generated always as identity primary key,
  reserva_id text not null,
  user_id text,
  kind text not null,
  sent_at timestamptz not null default now(),
  meta jsonb not null default '{}'::jsonb
);

create unique index if not exists uq_customer_notification_log_reserva_kind
  on public.customer_notification_log (reserva_id, kind);

alter table public.customer_notification_log enable row level security;

-- Devuelve true solo si ESTE llamado puede enviar el aviso.
-- p_cooldown_seconds null = una sola vez por reserva; con valor = repetible cada N segundos.
create or replace function public.claim_customer_notification(
  p_reserva_id text,
  p_user_id text,
  p_kind text,
  p_cooldown_seconds integer default null,
  p_meta jsonb default '{}'::jsonb
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claimed boolean;
begin
  insert into public.customer_notification_log as l (reserva_id, user_id, kind, meta)
  values (p_reserva_id, p_user_id, p_kind, coalesce(p_meta, '{}'::jsonb))
  on conflict (reserva_id, kind) do update
    set sent_at = now(),
        meta = coalesce(p_meta, '{}'::jsonb),
        user_id = coalesce(excluded.user_id, l.user_id)
    where p_cooldown_seconds is not null
      and l.sent_at <= now() - make_interval(secs => p_cooldown_seconds)
  returning true into v_claimed;

  return coalesce(v_claimed, false);
end;
$$;

revoke all on function public.claim_customer_notification(text, text, text, integer, jsonb)
  from public, anon, authenticated;
grant execute on function public.claim_customer_notification(text, text, text, integer, jsonb)
  to service_role;

-- 4) Avisos promocionales: maximo un push promocional por cliente cada 24 horas
create table if not exists public.customer_promotion_push_log (
  promo_code text not null,
  user_id text not null,
  sent_at timestamptz not null default now(),
  primary key (promo_code, user_id)
);

create index if not exists idx_customer_promotion_push_log_user_sent
  on public.customer_promotion_push_log (user_id, sent_at desc);

alter table public.customer_promotion_push_log enable row level security;

create or replace function public.claim_customer_promotion_push(
  p_promo_code text,
  p_user_id text,
  p_cooldown_hours integer default 24
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claimed boolean;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id, 0));

  if exists (
    select 1 from public.customer_promotion_push_log
    where user_id = p_user_id
      and sent_at > now() - make_interval(hours => greatest(1, p_cooldown_hours))
  ) then
    return false;
  end if;

  insert into public.customer_promotion_push_log (promo_code, user_id)
  values (p_promo_code, p_user_id)
  on conflict (promo_code, user_id) do nothing
  returning true into v_claimed;

  return coalesce(v_claimed, false);
end;
$$;

revoke all on function public.claim_customer_promotion_push(text, text, integer)
  from public, anon, authenticated;
grant execute on function public.claim_customer_promotion_push(text, text, integer)
  to service_role;

notify pgrst, 'reload schema';
