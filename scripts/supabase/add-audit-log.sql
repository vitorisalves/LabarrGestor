-- Registro de auditoria: quem fez o quê e quando (ações destrutivas e mudanças de acesso).
create table if not exists public.audit_log (id text primary key, data jsonb not null, updated_at timestamptz not null default now());
create table if not exists test.audit_log   (id text primary key, data jsonb not null, updated_at timestamptz not null default now());

alter table public.audit_log enable row level security;
alter table test.audit_log   enable row level security;
grant all privileges on test.audit_log to service_role;

create index if not exists audit_log_updated_at_idx on public.audit_log (updated_at desc);
