-- Promociones aplicables a viajes LuxRides, separadas de los tickets Mayahuel.
create table if not exists public.luxrides_ride_promotions (
  id uuid primary key default gen_random_uuid(),
  code varchar(50) not null unique,
  description varchar(200) not null,
  discount_type varchar(20) not null check (discount_type in ('PERCENTAGE', 'FIXED_AMOUNT')),
  discount_value numeric(10,2) not null check (discount_value > 0),
  min_passengers integer not null default 1 check (min_passengers >= 1),
  max_passengers integer not null default 7 check (max_passengers >= min_passengers),
  max_uses integer not null default 100 check (max_uses >= 1),
  uses_count integer not null default 0 check (uses_count >= 0),
  starts_at timestamptz not null default now(),
  expires_at timestamptz not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.luxrides_ride_promo_redemptions (
  id bigint generated always as identity primary key,
  promotion_id uuid not null references public.luxrides_ride_promotions(id),
  reservation_id text not null unique,
  original_amount numeric(10,2) not null,
  discount_amount numeric(10,2) not null,
  discounted_total numeric(10,2) not null,
  passengers integer not null,
  redeemed_at timestamptz not null default now()
);

alter table public.luxrides_ride_promotions enable row level security;
alter table public.luxrides_ride_promo_redemptions enable row level security;

create or replace function public.validate_luxrides_ride_promo(
  p_code text,
  p_passengers integer,
  p_amount numeric
) returns table (
  is_valid boolean,
  message text,
  discount_amount numeric,
  discounted_total numeric,
  promo_code text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  promo public.luxrides_ride_promotions%rowtype;
  discount numeric(10,2);
begin
  select * into promo
  from public.luxrides_ride_promotions
  where upper(code) = upper(trim(p_code)) and is_active
  limit 1;

  if not found then
    return query select false, 'El código no existe o está inactivo.'::text, null::numeric, null::numeric, null::text;
    return;
  end if;
  if now() < promo.starts_at or now() > promo.expires_at then
    return query select false, 'El descuento todavía no está vigente o ya venció.'::text, null::numeric, null::numeric, null::text;
    return;
  end if;
  if promo.uses_count >= promo.max_uses then
    return query select false, 'El descuento alcanzó su límite de usos.'::text, null::numeric, null::numeric, null::text;
    return;
  end if;
  if p_passengers < promo.min_passengers or p_passengers > promo.max_passengers then
    return query select false, ('Este descuento aplica de ' || promo.min_passengers || ' a ' || promo.max_passengers || ' pasajeros.')::text, null::numeric, null::numeric, null::text;
    return;
  end if;
  if p_amount is null or p_amount <= 0 then
    return query select false, 'El total del viaje no es válido.'::text, null::numeric, null::numeric, null::text;
    return;
  end if;

  discount := case
    when promo.discount_type = 'PERCENTAGE' then round(p_amount * promo.discount_value / 100, 2)
    else least(promo.discount_value, p_amount)
  end;
  return query select true, 'Descuento aplicado.'::text, discount, greatest(0, p_amount - discount), promo.code::text;
end;
$$;

create or replace function public.redeem_luxrides_ride_promo(
  p_code text,
  p_passengers integer,
  p_amount numeric,
  p_reservation_id text
) returns table (
  is_valid boolean,
  message text,
  discount_amount numeric,
  discounted_total numeric,
  promo_code text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  promo public.luxrides_ride_promotions%rowtype;
  previous public.luxrides_ride_promo_redemptions%rowtype;
  discount numeric(10,2);
begin
  select * into promo
  from public.luxrides_ride_promotions
  where upper(code) = upper(trim(p_code))
  for update;

  if not found then
    return query select false, 'El código no existe.'::text, null::numeric, null::numeric, null::text;
    return;
  end if;

  select * into previous from public.luxrides_ride_promo_redemptions
  where reservation_id = p_reservation_id;
  if found then
    if previous.promotion_id = promo.id and previous.original_amount = p_amount and previous.passengers = p_passengers then
      return query select true, 'Descuento aplicado.'::text, previous.discount_amount, previous.discounted_total, promo.code::text;
    else
      return query select false, 'El folio de reserva ya fue usado con otro descuento.'::text, null::numeric, null::numeric, null::text;
    end if;
    return;
  end if;

  if not promo.is_active or now() < promo.starts_at or now() > promo.expires_at then
    return query select false, 'El descuento no está vigente.'::text, null::numeric, null::numeric, null::text;
    return;
  end if;
  if promo.uses_count >= promo.max_uses then
    return query select false, 'El descuento alcanzó su límite de usos.'::text, null::numeric, null::numeric, null::text;
    return;
  end if;
  if p_passengers < promo.min_passengers or p_passengers > promo.max_passengers then
    return query select false, ('Este descuento aplica de ' || promo.min_passengers || ' a ' || promo.max_passengers || ' pasajeros.')::text, null::numeric, null::numeric, null::text;
    return;
  end if;
  if p_amount is null or p_amount <= 0 or trim(coalesce(p_reservation_id, '')) = '' then
    return query select false, 'Los datos del viaje no son válidos.'::text, null::numeric, null::numeric, null::text;
    return;
  end if;

  discount := case
    when promo.discount_type = 'PERCENTAGE' then round(p_amount * promo.discount_value / 100, 2)
    else least(promo.discount_value, p_amount)
  end;
  update public.luxrides_ride_promotions
    set uses_count = uses_count + 1
    where id = promo.id;
  insert into public.luxrides_ride_promo_redemptions
    (promotion_id, reservation_id, original_amount, discount_amount, discounted_total, passengers)
  values (promo.id, p_reservation_id, p_amount, discount, greatest(0, p_amount - discount), p_passengers);

  return query select true, 'Descuento aplicado.'::text, discount, greatest(0, p_amount - discount), promo.code::text;
end;
$$;

create or replace function public.release_luxrides_ride_promo(p_reservation_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  promo_id uuid;
begin
  if exists (select 1 from public.reservas where reserva_id = p_reservation_id) then
    return false;
  end if;
  delete from public.luxrides_ride_promo_redemptions
  where reservation_id = p_reservation_id
  returning promotion_id into promo_id;
  if promo_id is null then
    return false;
  end if;
  update public.luxrides_ride_promotions
  set uses_count = greatest(0, uses_count - 1)
  where id = promo_id;
  return true;
end;
$$;

revoke all on function public.validate_luxrides_ride_promo(text, integer, numeric) from public, anon, authenticated;
revoke all on function public.redeem_luxrides_ride_promo(text, integer, numeric, text) from public, anon, authenticated;
revoke all on function public.release_luxrides_ride_promo(text) from public, anon, authenticated;
grant execute on function public.validate_luxrides_ride_promo(text, integer, numeric) to service_role;
grant execute on function public.redeem_luxrides_ride_promo(text, integer, numeric, text) to service_role;
grant execute on function public.release_luxrides_ride_promo(text) to service_role;

alter table if exists public.reservas
  add column if not exists total_sin_descuento numeric(10,2),
  add column if not exists codigo_descuento text,
  add column if not exists monto_descuento numeric(10,2);

notify pgrst, 'reload schema';
