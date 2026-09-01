-- ============================================================================
-- Phase 4 — Ingredient BOM + Depletion Alerts
-- ============================================================================
-- Tables:  ingredients, recipes (junction), depletion_alerts
-- Seeds:   15 fabricated ingredients, recipes for all made-to-order items
-- Model:   predict-depletion edge fn writes projected stockout time per
--          ingredient into depletion_alerts; KDS subscribes via realtime.
-- RLS:     open policies (demo pattern, matches Phase 1-3).
-- ============================================================================

-- --- 1. ingredients ---------------------------------------------------------
create table if not exists public.ingredients (
  id                bigint generated always as identity primary key,
  name              text        not null unique,
  unit              text        not null,             -- g | ml | pcs
  stock_qty         numeric     not null default 0,   -- current on-hand
  reorder_threshold numeric     not null default 0,   -- "low" line
  updated_at        timestamptz not null default now()
);

-- --- 2. recipes (bill of materials) -----------------------------------------
create table if not exists public.recipes (
  item_id          integer not null references public.menu_items(id) on delete cascade,
  ingredient_id    bigint  not null references public.ingredients(id) on delete cascade,
  qty_per_serving  numeric not null,                  -- in the ingredient's unit
  primary key (item_id, ingredient_id)
);
create index if not exists idx_recipes_ingredient on public.recipes(ingredient_id);
create index if not exists idx_recipes_item on public.recipes(item_id);

-- --- 3. depletion_alerts (one row per at-risk ingredient, upserted) ---------
create table if not exists public.depletion_alerts (
  ingredient_id     bigint primary key references public.ingredients(id) on delete cascade,
  ingredient_name   text        not null,
  projected_empty_at timestamptz,                     -- null = not projected to empty today
  minutes_to_empty  numeric,
  burn_per_min      numeric,
  severity          text        not null default 'warning', -- warning | critical
  affected_items    jsonb       not null default '[]'::jsonb, -- [{id,name}]
  deferred_until    timestamptz,                       -- operator "defer" sets this
  updated_at        timestamptz not null default now()
);

-- --- RLS: open (demo) --------------------------------------------------------
alter table public.ingredients      enable row level security;
alter table public.recipes          enable row level security;
alter table public.depletion_alerts enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename='ingredients' and policyname='ingredients_all') then
    create policy ingredients_all on public.ingredients for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='recipes' and policyname='recipes_all') then
    create policy recipes_all on public.recipes for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='depletion_alerts' and policyname='depletion_alerts_all') then
    create policy depletion_alerts_all on public.depletion_alerts for all using (true) with check (true);
  end if;
end $$;

-- --- Realtime: KDS banner subscribes to depletion_alerts --------------------
do $$
begin
  begin
    alter publication supabase_realtime add table public.depletion_alerts;
  exception when duplicate_object then null;
  end;
end $$;

-- ============================================================================
-- SEED: 15 ingredients  (id assigned by identity; referenced by name below)
-- ============================================================================
insert into public.ingredients (name, unit, stock_qty, reorder_threshold) values
  ('Onion',                 'g',   20000, 3000),
  ('Potato',                'g',   25000, 4000),
  ('Tomato',                'g',   15000, 2500),
  ('Paneer',                'g',    8000, 1500),
  ('Milk',                  'ml',  30000, 5000),
  ('Pav/Bun',               'pcs',   300,   60),
  ('Bread Slice',           'pcs',   400,   80),
  ('Rice',                  'g',   40000, 6000),
  ('Wheat Flour',           'g',   25000, 4000),
  ('Refined Flour (Maida)', 'g',   15000, 2500),
  ('Eggs',                  'pcs',   200,   40),
  ('Chicken',               'g',   12000, 2000),
  ('Cheese',                'g',    6000, 1200),
  ('Cooking Oil',           'ml',  20000, 3000),
  ('Instant Noodles',       'pcs',   250,   50)
on conflict (name) do nothing;

-- ============================================================================
-- SEED: recipes for all made-to-order items.
-- Uses item_id (menu_items.id, fixed) + ingredient id looked up by name.
-- Packaged items (35 Water, 36 Coke) intentionally have NO recipe -> depletion
-- tracked via their own stock_today. Item 4 (Lime Soda) has no modeled BOM.
-- ============================================================================
with ing as (select id, name from public.ingredients)
insert into public.recipes (item_id, ingredient_id, qty_per_serving)
select v.item_id, ing.id, v.qty
from (values
  -- beverages
  (1,  'Milk', 60),
  (2,  'Milk', 80),
  (3,  'Milk', 150),
  (5,  'Milk', 70),
  (37, 'Milk', 150),
  (38, 'Milk', 180),
  -- lunch_dinner
  (16, 'Rice', 150), (16, 'Wheat Flour', 80), (16, 'Onion', 40), (16, 'Tomato', 40), (16, 'Potato', 60), (16, 'Cooking Oil', 20),
  (17, 'Rice', 180), (17, 'Onion', 40), (17, 'Tomato', 50), (17, 'Cooking Oil', 15),
  (18, 'Refined Flour (Maida)', 120), (18, 'Onion', 40), (18, 'Tomato', 40), (18, 'Cooking Oil', 30),
  (19, 'Paneer', 120), (19, 'Tomato', 80), (19, 'Onion', 50), (19, 'Wheat Flour', 80), (19, 'Cooking Oil', 20),
  (20, 'Rice', 120), (20, 'Onion', 30), (20, 'Tomato', 30), (20, 'Cooking Oil', 15),
  (21, 'Rice', 200), (21, 'Onion', 60), (21, 'Tomato', 40), (21, 'Potato', 40), (21, 'Cooking Oil', 25),
  (22, 'Rice', 100), (22, 'Potato', 120), (22, 'Onion', 40), (22, 'Cooking Oil', 20),
  (23, 'Rice', 120), (23, 'Onion', 30), (23, 'Tomato', 30),
  (24, 'Rice', 120), (24, 'Onion', 50), (24, 'Tomato', 40), (24, 'Cooking Oil', 15),
  (25, 'Rice', 200), (25, 'Chicken', 180), (25, 'Onion', 70), (25, 'Tomato', 50), (25, 'Cooking Oil', 30),
  (26, 'Eggs', 2), (26, 'Pav/Bun', 2), (26, 'Onion', 40), (26, 'Tomato', 30), (26, 'Cooking Oil', 15),
  (27, 'Chicken', 120), (27, 'Wheat Flour', 70), (27, 'Onion', 40), (27, 'Cooking Oil', 20),
  -- snacks
  (6,  'Potato', 100), (6, 'Pav/Bun', 1), (6, 'Cooking Oil', 20),
  (7,  'Potato', 90), (7, 'Refined Flour (Maida)', 50), (7, 'Cooking Oil', 25),
  (8,  'Pav/Bun', 2), (8, 'Onion', 40), (8, 'Tomato', 40), (8, 'Cooking Oil', 15),
  (9,  'Onion', 30), (9, 'Tomato', 30), (9, 'Potato', 40),
  (10, 'Onion', 30), (10, 'Tomato', 30), (10, 'Potato', 40),
  (11, 'Pav/Bun', 2), (11, 'Potato', 120), (11, 'Tomato', 80), (11, 'Onion', 60), (11, 'Cooking Oil', 25),
  (12, 'Instant Noodles', 1), (12, 'Onion', 20), (12, 'Cooking Oil', 10),
  (13, 'Instant Noodles', 1), (13, 'Cheese', 40), (13, 'Onion', 20), (13, 'Cooking Oil', 10),
  (14, 'Bread Slice', 2), (14, 'Cheese', 30), (14, 'Tomato', 30), (14, 'Onion', 20),
  (15, 'Bread Slice', 2), (15, 'Cheese', 50),
  (28, 'Instant Noodles', 1), (28, 'Eggs', 1), (28, 'Onion', 20), (28, 'Cooking Oil', 10),
  (29, 'Wheat Flour', 70), (29, 'Potato', 80), (29, 'Onion', 40), (29, 'Cooking Oil', 20),
  (30, 'Potato', 200), (30, 'Cooking Oil', 40),
  (31, 'Potato', 200), (31, 'Cheese', 50), (31, 'Cooking Oil', 40),
  (39, 'Onion', 30), (39, 'Potato', 40), (39, 'Cooking Oil', 10),
  (40, 'Onion', 30), (40, 'Cooking Oil', 10),
  -- desserts
  (32, 'Refined Flour (Maida)', 60), (32, 'Milk', 80), (32, 'Eggs', 1),
  (33, 'Milk', 100),
  (34, 'Milk', 120), (34, 'Refined Flour (Maida)', 40)
) as v(item_id, ing_name, qty)
join ing on ing.name = v.ing_name
on conflict (item_id, ingredient_id) do nothing;

-- ============================================================================
-- SANITY (Session-3 pattern): verify seed landed
-- ============================================================================
do $$
declare
  n_ing int; n_rec int; n_items int;
begin
  select count(*) into n_ing  from public.ingredients;
  select count(*) into n_rec  from public.recipes;
  select count(distinct item_id) into n_items from public.recipes;
  raise notice 'ingredients=% recipes=% items_with_recipe=%', n_ing, n_rec, n_items;
  if n_ing < 15 then raise exception 'expected >=15 ingredients, got %', n_ing; end if;
  if n_items < 36 then raise exception 'expected >=36 items with recipes, got %', n_items; end if;
end $$;
