-- =========================================================
-- Canteen MVP — MIGRATION (safe on your existing DB)
-- Only ADD COLUMN IF NOT EXISTS + backfill defaults.
-- Does NOT delete data, does NOT change primary key types.
-- Run in Supabase SQL editor.
-- =========================================================

create extension if not exists "pgcrypto";

-- ---------- enums (create only if missing) ----------
do $$ begin
  create type item_category as enum ('mains', 'snacks', 'beverages', 'desserts');
exception when duplicate_object then null; end $$;

do $$ begin
  create type order_status as enum ('pending', 'preparing', 'ready', 'completed', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type user_role as enum ('student', 'operator', 'admin');
exception when duplicate_object then null; end $$;

-- ---------- menu_items: add missing cols ----------
alter table if exists menu_items add column if not exists external_id  text;
alter table if exists menu_items add column if not exists is_available boolean not null default true;
alter table if exists menu_items add column if not exists prep_seconds int     not null default 300;
alter table if exists menu_items add column if not exists image_url    text;
alter table if exists menu_items add column if not exists created_at   timestamptz not null default now();

-- realistic per-category defaults on newly-added prep_seconds
update menu_items set prep_seconds = 240
  where (prep_seconds is null or prep_seconds = 0 or prep_seconds = 300)
    and category::text = 'mains';
update menu_items set prep_seconds = 180
  where (prep_seconds is null or prep_seconds = 0 or prep_seconds = 300)
    and category::text = 'snacks';
update menu_items set prep_seconds = 60
  where (prep_seconds is null or prep_seconds = 0 or prep_seconds = 300)
    and category::text = 'beverages';
update menu_items set prep_seconds = 90
  where (prep_seconds is null or prep_seconds = 0 or prep_seconds = 300)
    and category::text = 'desserts';

-- ---------- orders: add missing cols ----------
alter table if exists orders add column if not exists status       order_status not null default 'pending';
alter table if exists orders add column if not exists total_amount numeric(10,2) not null default 0;
alter table if exists orders add column if not exists eta_seconds  int;
alter table if exists orders add column if not exists placed_at    timestamptz not null default now();
alter table if exists orders add column if not exists ready_at     timestamptz;
alter table if exists orders add column if not exists completed_at timestamptz;

-- if orders already had a created_at column, backfill placed_at from it
do $$ begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='orders' and column_name='created_at'
  ) then
    execute 'update orders set placed_at = coalesce(placed_at, created_at)';
  end if;
end $$;

create index if not exists orders_status_idx    on orders(status);
create index if not exists orders_placed_at_idx on orders(placed_at desc);
create index if not exists orders_student_idx   on orders(student_id);

-- ---------- order_items: ensure unit_price exists ----------
alter table if exists order_items add column if not exists unit_price numeric(10,2);
create index if not exists order_items_order_idx on order_items(order_id);

-- ---------- profiles: role + timestamps ----------
alter table if exists profiles add column if not exists role user_role not null default 'student';
alter table if exists profiles add column if not exists created_at timestamptz not null default now();

-- ---------- Realtime: enable only if not already ----------
do $$ begin
  perform 1 from pg_publication_tables
    where pubname='supabase_realtime' and tablename='orders';
  if not found then execute 'alter publication supabase_realtime add table orders'; end if;
  perform 1 from pg_publication_tables
    where pubname='supabase_realtime' and tablename='order_items';
  if not found then execute 'alter publication supabase_realtime add table order_items'; end if;
end $$;

-- ---------- RLS (open MVP; tighten later) ----------
alter table profiles          enable row level security;
alter table menu_items        enable row level security;
alter table orders            enable row level security;
alter table order_items       enable row level security;

drop policy if exists menu_public_read        on menu_items;
drop policy if exists profiles_public_read    on profiles;
drop policy if exists orders_public_read      on orders;
drop policy if exists order_items_public_read on order_items;
drop policy if exists orders_insert           on orders;
drop policy if exists order_items_insert      on order_items;
drop policy if exists orders_update           on orders;

create policy menu_public_read        on menu_items       for select using (true);
create policy profiles_public_read    on profiles         for select using (true);
create policy orders_public_read      on orders           for select using (true);
create policy order_items_public_read on order_items      for select using (true);
create policy orders_insert           on orders           for insert with check (true);
create policy order_items_insert      on order_items      for insert with check (true);
create policy orders_update           on orders           for update using (true) with check (true);

-- ---------- sanity report ----------
do $$
declare n_menu int; n_orders int; n_items int; n_profiles int;
begin
  select count(*) into n_menu     from menu_items;
  select count(*) into n_orders   from orders;
  select count(*) into n_items    from order_items;
  select count(*) into n_profiles from profiles;
  raise notice 'menu_items=% orders=% order_items=% profiles=%',
    n_menu, n_orders, n_items, n_profiles;
end $$;
