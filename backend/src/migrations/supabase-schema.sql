create table if not exists public.notificaciones (
  id bigint generated always as identity primary key,
  reserva_id text,
  usuario_id text,
  tipo text,
  titulo text,
  mensaje text,
  leida boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_notificaciones_reserva_id
  on public.notificaciones (reserva_id);

create index if not exists idx_notificaciones_usuario_id
  on public.notificaciones (usuario_id);

create index if not exists idx_notificaciones_leida
  on public.notificaciones (leida);

create table if not exists public.push_subscriptions (
  id bigint generated always as identity primary key,
  chofer_id text not null unique,
  subscription jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_push_subscriptions_chofer_id
  on public.push_subscriptions (chofer_id);

alter table public.viajes
add column if not exists rechazado_en timestamptz;
