-- Tabela da configuração de estimativa de preços. Rode UMA vez no SQL Editor do Supabase. É idempotente.

create table if not exists public.price_settings (id text primary key, data jsonb not null, updated_at timestamptz not null default now());
create table if not exists test.price_settings   (id text primary key, data jsonb not null, updated_at timestamptz not null default now());

alter table public.price_settings enable row level security;
alter table test.price_settings   enable row level security;

grant all privileges on test.price_settings to service_role;
