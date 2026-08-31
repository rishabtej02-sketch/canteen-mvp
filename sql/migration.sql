-- =========================================================
-- Canteen MVP — MIGRATION for pre-existing DB
-- Safe to run repeatedly. Adds any missing columns so
-- the frontend queries succeed regardless of prior shape.
-- Run in Supabase SQL editor.
-- =========================================================

create extension if not exists "pgcrypto";

-- ---------- enums (create if missing) ----------
do $$ begin
  create type item_category as enum ('mains', 'snacks', 'beverages', 'desserts');
exception when duplicate_object then null; end $$;

do $$ begin
  create type order_status as enum ('pending', 'preparing', 'ready', 'completed', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type user_role as enum ('student', 'operator', 'admin');
exception when duplicate_object then null; end $$;

-- ---------- menu_items ----------
alter table if exists menu_items add column if not exists external_id  text;
alter table if exists menu_items add column if not exists is_available boolean not null default true;
alter table if exists menu_items add column if not exists prep_seconds int     not null default 300;
alter table if exists menu_items add column if not exists image_url    text;
alter table if exists menu_items add column if not exists created_at   timestamptz not null default now();

-- realistic per-category defaults if column was just added and all zeros
update menu_items set prep_seconds = 240 where prep_seconds is null or prep_seconds = 0 and category::text = 'mains';
update menu_items set prep_seconds = 180 where prep_seconds is null or prep_seconds = 0 and category::text = 'snacks';
update menu_items set prep_seconds = 60  where prep_seconds is null or prep_seconds = 0 and category::text = 'beverages';
update menu_items set prep_seconds = 90  where prep_seconds is null or prep_seconds = 0 and category::text = 'desserts';
update menu_items set prep_seconds = 300 where prep_seconds is null or prep_seconds = 0;

-- ---------- orders ----------
alter table if exists orders add column if not exists status       order_status not null default 'pending';
alter table if exists orders add column if not exists total_amount numeric(10,2) not null default 0;
alter table if exists orders add column if not exists eta_seconds  int;
alter table if exists orders add column if not exists placed_at    timestamptz not null default now();
alter table if exists orders add column if not exists ready_at     timestamptz;
alter table if exists orders add column if not exists completed_at timestamptz;

-- if placed_at was just added, backfill from created_at (if present) or now()
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_name='orders' and column_name='created_at') then
    execute 'update orders set placed_at = coalesce(placed_at, created_at) where placed_at is null';
  end if;
end $$;

create index if not exists orders_status_idx    on orders(status);
create index if not exists orders_placed_at_idx on orders(placed_at desc);
create index if not exists orders_student_idx   on orders(student_id);

-- ---------- order_items ----------
alter table if exists order_items add column if not exists unit_price numeric(10,2);
create index if not exists order_items_order_idx on order_items(order_id);

-- ---------- profiles ----------
alter table if exists profiles add column if not exists role user_role not null default 'student';
alter table if exists profiles add column if not exists created_at timestamptz not null default now();

-- ---------- forecasts + reco (create if missing) ----------
create table if not exists hourly_forecasts (
  id           bigserial primary key,
  item_id      bigint not null references menu_items(id),
  hour_ts      timestamptz not null,
  yhat         numeric(10,2) not null,
  yhat_lower   numeric(10,2),
  yhat_upper   numeric(10,2),
  model_ver    text,
  created_at   timestamptz not null default now(),
  unique(item_id, hour_ts, model_ver)
);
create table if not exists item_reco_weights (
  id           bigserial primary key,
  student_id   uuid references profiles(id) on delete cascade,
  item_id      bigint not null references menu_items(id),
  weight       numeric(10,4) not null default 0,
  updated_at   timestamptz not null default now(),
  unique(student_id, item_id)
);

-- ---------- Realtime (safe: only add if not already member) ----------
do $$ begin
  perform 1 from pg_publication_tables
    where pubname='supabase_realtime' and tablename='orders';
  if not found then
    execute 'alter publication supabase_realtime add table orders';
  end if;
  perform 1 from pg_publication_tables
    where pubname='supabase_realtime' and tablename='order_items';
  if not found then
    execute 'alter publication supabase_realtime add table order_items';
  end if;
end $$;

-- ---------- RLS (open for MVP; tighten later) ----------
alter table profiles          enable row level security;
alter table menu_items        enable row level security;
alter table orders            enable row level security;
alter table order_items       enable row level security;
alter table hourly_forecasts  enable row level security;
alter table item_reco_weights enable row level security;

drop policy if exists menu_public_read       on menu_items;
drop policy if exists profiles_public_read   on profiles;
drop policy if exists orders_public_read     on orders;
drop policy if exists order_items_public_read on order_items;
drop policy if exists orders_insert          on orders;
drop policy if exists order_items_insert     on order_items;
drop policy if exists orders_update          on orders;
drop policy if exists forecasts_read         on hourly_forecasts;
drop policy if exists reco_read              on item_reco_weights;

create policy menu_public_read        on menu_items       for select using (true);
create policy profiles_public_read    on profiles         for select using (true);
create policy orders_public_read      on orders           for select using (true);
create policy order_items_public_read on order_items      for select using (true);
create policy orders_insert           on orders           for insert with check (true);
create policy order_items_insert      on order_items      for insert with check (true);
create policy orders_update           on orders           for update using (true) with check (true);
create policy forecasts_read          on hourly_forecasts for select using (true);
create policy reco_read               on item_reco_weights for select using (true);

-- ---------- helper: recompute order total from lines ----------
create or replace function recompute_order_total(oid bigint)
returns void language sql as $$
  update orders o
  set total_amount = coalesce((
    select sum(quantity * unit_price) from order_items where order_id = oid
  ), 0)
  where o.id = oid;
$$;

-- ---------- sanity report ----------
do $$
declare
  n_menu   int; n_orders int; n_items  int; n_profiles int;
begin
  select count(*) into n_menu     from menu_items;
  select count(*) into n_orders   from orders;
  select count(*) into n_items    from order_items;
  select count(*) into n_profiles from profiles;
  raise notice 'menu_items=% orders=% order_items=% profiles=%',
    n_menu, n_orders, n_items, n_profiles;
end $$;
