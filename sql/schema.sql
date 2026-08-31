-- =========================================================
-- Canteen MVP — Postgres schema (Supabase)
-- Run in Supabase SQL editor. Idempotent.
-- =========================================================

create extension if not exists "pgcrypto";

-- --- enums ------------------------------------------------
do $$ begin
  create type item_category as enum ('mains', 'snacks', 'beverages', 'desserts');
exception when duplicate_object then null; end $$;

do $$ begin
  create type order_status as enum ('pending', 'preparing', 'ready', 'completed', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type user_role as enum ('student', 'operator', 'admin');
exception when duplicate_object then null; end $$;

-- --- profiles ---------------------------------------------
create table if not exists profiles (
  id           uuid primary key default gen_random_uuid(),
  email        text unique not null,
  full_name    text,
  role         user_role not null default 'student',
  created_at   timestamptz not null default now()
);

-- --- menu_items -------------------------------------------
create table if not exists menu_items (
  id           bigserial primary key,
  external_id  text unique,               -- e.g. 'I014' from CSVs
  name         text not null,
  category     item_category not null,
  price        numeric(10,2) not null check (price >= 0),
  is_available boolean not null default true,
  prep_seconds int not null default 300,   -- default ETA base
  image_url    text,
  created_at   timestamptz not null default now()
);

-- --- orders -----------------------------------------------
create table if not exists orders (
  id           bigserial primary key,
  student_id   uuid references profiles(id) on delete set null,
  status       order_status not null default 'pending',
  total_amount numeric(10,2) not null default 0,
  eta_seconds  int,
  placed_at    timestamptz not null default now(),
  ready_at     timestamptz,
  completed_at timestamptz
);
create index if not exists orders_status_idx on orders(status);
create index if not exists orders_placed_at_idx on orders(placed_at desc);

-- --- order_items ------------------------------------------
create table if not exists order_items (
  id           bigserial primary key,
  order_id     bigint not null references orders(id) on delete cascade,
  item_id      bigint not null references menu_items(id),
  quantity     int not null check (quantity > 0),
  unit_price   numeric(10,2) not null
);
create index if not exists order_items_order_idx on order_items(order_id);

-- --- ML: forecasts + recommender weights ------------------
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

-- --- realtime enable --------------------------------------
alter publication supabase_realtime add table orders;
alter publication supabase_realtime add table order_items;

-- --- Row Level Security -----------------------------------
alter table profiles      enable row level security;
alter table menu_items    enable row level security;
alter table orders        enable row level security;
alter table order_items   enable row level security;
alter table hourly_forecasts enable row level security;
alter table item_reco_weights enable row level security;

-- Public read of menu
drop policy if exists menu_public_read on menu_items;
create policy menu_public_read on menu_items for select using (true);

-- Anyone can read orders (MVP; tighten later)
drop policy if exists orders_public_read on orders;
create policy orders_public_read on orders for select using (true);

drop policy if exists order_items_public_read on order_items;
create policy order_items_public_read on order_items for select using (true);

-- Anyone can insert orders (MVP — bind to auth.uid() later)
drop policy if exists orders_insert on orders;
create policy orders_insert on orders for insert with check (true);

drop policy if exists order_items_insert on order_items;
create policy order_items_insert on order_items for insert with check (true);

-- Operator/admin can update order status (MVP: allow any authed)
drop policy if exists orders_update on orders;
create policy orders_update on orders for update using (true) with check (true);

-- profiles readable for name display
drop policy if exists profiles_public_read on profiles;
create policy profiles_public_read on profiles for select using (true);

-- forecasts + reco weights readable
drop policy if exists forecasts_read on hourly_forecasts;
create policy forecasts_read on hourly_forecasts for select using (true);
drop policy if exists reco_read on item_reco_weights;
create policy reco_read on item_reco_weights for select using (true);

-- --- helper: recompute order total ------------------------
create or replace function recompute_order_total(oid bigint)
returns void language sql as $$
  update orders o
  set total_amount = coalesce((
    select sum(quantity * unit_price) from order_items where order_id = oid
  ), 0)
  where o.id = oid;
$$;
