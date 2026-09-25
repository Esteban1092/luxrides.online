create table if not exists public.driver_chat_messages (
  id bigint generated always as identity primary key,
  conversation_id text not null,
  customer_id text not null,
  driver_id text not null,
  sender_role text not null check (sender_role in ('customer', 'driver', 'admin')),
  sender_id text not null,
  sender_name text not null default '',
  message text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_driver_chat_conversation
  on public.driver_chat_messages (conversation_id, created_at);

create index if not exists idx_driver_chat_driver
  on public.driver_chat_messages (driver_id, created_at);

create index if not exists idx_driver_chat_customer
  on public.driver_chat_messages (customer_id, created_at);

alter table public.driver_chat_messages enable row level security;
