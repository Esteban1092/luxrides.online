-- LuxRides bookings hardening
-- 1) passenger_name NOT NULL
-- 2) confirmation_code unique autogeneration trigger

alter table if exists public.bookings
  alter column passenger_name set not null;

alter table if exists public.bookings
  add column if not exists confirmation_code text;

-- Backfill empty codes before constraints.
update public.bookings
set confirmation_code = upper(
  'CONF-' || to_char(now(), 'YYMMDD') || '-' || substring(md5(random()::text || clock_timestamp()::text) from 1 for 6)
)
where confirmation_code is null or btrim(confirmation_code) = '';

alter table if exists public.bookings
  alter column confirmation_code set not null;

create unique index if not exists bookings_confirmation_code_uq
  on public.bookings (confirmation_code);

create or replace function public.gen_booking_confirmation_code()
returns trigger
language plpgsql
as $$
begin
  if new.confirmation_code is null or btrim(new.confirmation_code) = '' then
    loop
      new.confirmation_code := upper(
        'CONF-' || to_char(now(), 'YYMMDD') || '-' || substring(md5(random()::text || clock_timestamp()::text) from 1 for 6)
      );
      exit when not exists (
        select 1 from public.bookings b where b.confirmation_code = new.confirmation_code
      );
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_bookings_confirmation_code on public.bookings;
create trigger trg_bookings_confirmation_code
before insert on public.bookings
for each row
execute function public.gen_booking_confirmation_code();
