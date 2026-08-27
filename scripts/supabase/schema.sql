create schema if not exists test;

-- macro aplicada às 16 coleções, nos schemas public e test:
--   invoices, xml_spendings, price_increases, suppliers, categories, setores,
--   product_categories, product_setores, authorized_users, delivered_products,
--   reminders, shopping_lists, purchase_orders, pending_list_products,
--   setor_limits, push_subscriptions

create table if not exists public.invoices        (id text primary key, data jsonb not null, updated_at timestamptz not null default now());
create table if not exists public.xml_spendings   (id text primary key, data jsonb not null, updated_at timestamptz not null default now());
create table if not exists public.price_increases (id text primary key, data jsonb not null, updated_at timestamptz not null default now());
create table if not exists public.suppliers       (id text primary key, data jsonb not null, updated_at timestamptz not null default now());
create table if not exists public.categories      (id text primary key, data jsonb not null, updated_at timestamptz not null default now());
create table if not exists public.setores         (id text primary key, data jsonb not null, updated_at timestamptz not null default now());
create table if not exists public.product_categories (id text primary key, data jsonb not null, updated_at timestamptz not null default now());
create table if not exists public.product_setores    (id text primary key, data jsonb not null, updated_at timestamptz not null default now());
create table if not exists public.authorized_users   (id text primary key, data jsonb not null, updated_at timestamptz not null default now());
create table if not exists public.delivered_products (id text primary key, data jsonb not null, updated_at timestamptz not null default now());
create table if not exists public.reminders       (id text primary key, data jsonb not null, updated_at timestamptz not null default now());
create table if not exists public.shopping_lists  (id text primary key, data jsonb not null, updated_at timestamptz not null default now());
create table if not exists public.purchase_orders (id text primary key, data jsonb not null, updated_at timestamptz not null default now());
create table if not exists public.pending_list_products (id text primary key, data jsonb not null, updated_at timestamptz not null default now());
create table if not exists public.setor_limits    (id text primary key, data jsonb not null, updated_at timestamptz not null default now());
create table if not exists public.push_subscriptions    (id text primary key, data jsonb not null, updated_at timestamptz not null default now());

create table if not exists test.invoices        (id text primary key, data jsonb not null, updated_at timestamptz not null default now());
create table if not exists test.xml_spendings   (id text primary key, data jsonb not null, updated_at timestamptz not null default now());
create table if not exists test.price_increases (id text primary key, data jsonb not null, updated_at timestamptz not null default now());
create table if not exists test.suppliers       (id text primary key, data jsonb not null, updated_at timestamptz not null default now());
create table if not exists test.categories      (id text primary key, data jsonb not null, updated_at timestamptz not null default now());
create table if not exists test.setores         (id text primary key, data jsonb not null, updated_at timestamptz not null default now());
create table if not exists test.product_categories (id text primary key, data jsonb not null, updated_at timestamptz not null default now());
create table if not exists test.product_setores    (id text primary key, data jsonb not null, updated_at timestamptz not null default now());
create table if not exists test.authorized_users   (id text primary key, data jsonb not null, updated_at timestamptz not null default now());
create table if not exists test.delivered_products (id text primary key, data jsonb not null, updated_at timestamptz not null default now());
create table if not exists test.reminders       (id text primary key, data jsonb not null, updated_at timestamptz not null default now());
create table if not exists test.shopping_lists  (id text primary key, data jsonb not null, updated_at timestamptz not null default now());
create table if not exists test.purchase_orders (id text primary key, data jsonb not null, updated_at timestamptz not null default now());
create table if not exists test.pending_list_products (id text primary key, data jsonb not null, updated_at timestamptz not null default now());
create table if not exists test.setor_limits    (id text primary key, data jsonb not null, updated_at timestamptz not null default now());
create table if not exists test.push_subscriptions    (id text primary key, data jsonb not null, updated_at timestamptz not null default now());
