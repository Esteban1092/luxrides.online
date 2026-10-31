-- Run the updated 20261026_luxrides_ride_promotions.sql before this migration.
-- One saved ticket per account; activation never consumes a redemption.
create table if not exists public.luxrides_ride_ticket_activations (
  customer_id uuid primary key references auth.users(id) on delete cascade,
  promotion_id uuid not null references public.luxrides_ride_promotions(id) on delete cascade,
  activated_at timestamptz not null default now()
);

alter table public.luxrides_ride_ticket_activations enable row level security;
revoke all on public.luxrides_ride_ticket_activations from anon, authenticated;

create or replace function public.activate_luxrides_ride_ticket(p_code text)
returns table (code text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  customer uuid := auth.uid();
  promo public.luxrides_ride_promotions%rowtype;
begin
  if customer is null then
    raise exception 'Inicia sesión para activar un ticket de viaje.';
  end if;
  select * into promo from public.luxrides_ride_promotions
  where upper(luxrides_ride_promotions.code) = upper(trim(p_code))
  for update;
  if not found then
    raise exception 'El ticket de viaje no existe.';
  end if;
  if not promo.is_active or now() < promo.starts_at or now() > promo.expires_at then
    raise exception 'El ticket de viaje no está vigente.';
  end if;
  if promo.uses_count >= promo.max_uses then
    raise exception 'El ticket de viaje agotó sus canjes.';
  end if;

  insert into public.luxrides_ride_ticket_activations (customer_id, promotion_id)
  values (customer, promo.id)
  on conflict (customer_id) do update
    set promotion_id = excluded.promotion_id, activated_at = now();
  return query select promo.code::text, promo.expires_at;
end;
$$;

create or replace function public.get_active_luxrides_ride_ticket()
returns table (code text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Inicia sesión para consultar tu ticket de viaje.';
  end if;
  return query
    select p.code::text, p.expires_at
    from public.luxrides_ride_ticket_activations a
    join public.luxrides_ride_promotions p on p.id = a.promotion_id
    where a.customer_id = auth.uid()
      and p.is_active and now() between p.starts_at and p.expires_at
      and p.uses_count < p.max_uses;
end;
$$;

revoke all on function public.activate_luxrides_ride_ticket(text) from public, anon;
revoke all on function public.get_active_luxrides_ride_ticket() from public, anon;
grant execute on function public.activate_luxrides_ride_ticket(text) to authenticated;
grant execute on function public.get_active_luxrides_ride_ticket() to authenticated;

notify pgrst, 'reload schema';
