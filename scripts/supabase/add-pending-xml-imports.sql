-- Tabela das notas XML pendentes (Dashboard + Importar XML dos Produtos).
-- Rode UMA vez no SQL Editor do Supabase. É idempotente.

create table if not exists public.pending_xml_imports (id text primary key, data jsonb not null, updated_at timestamptz not null default now());
create table if not exists test.pending_xml_imports   (id text primary key, data jsonb not null, updated_at timestamptz not null default now());

alter table public.pending_xml_imports enable row level security;
alter table test.pending_xml_imports   enable row level security;

grant all privileges on test.pending_xml_imports to service_role;
