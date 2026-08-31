-- =========================================================
-- Canteen MVP — FIX: Realtime + backfill placed_at spread
-- Run in Supabase SQL editor. Idempotent. Safe.
-- =========================================================

-- ---------- 1. Realtime: force publication ----------
do $$ begin
  perform 1 from pg_publication where pubname='supabase_realtime';
  if not found then create publication supabase_realtime; end if;
end $$;

do $$ begin
  perform 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='orders';
  if not found then execute 'alter publication supabase_realtime add table orders'; end if;

  perform 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='order_items';
  if not found then execute 'alter publication supabase_realtime add table order_items'; end if;
end $$;

-- REPLICA IDENTITY FULL so UPDATE events carry full row (needed for filters)
alter table orders        replica identity full;
alter table order_items   replica identity full;

-- ---------- 2. Spread placed_at over last 14 days ----------
-- Only touch rows where placed_at is bunched (>=5 rows share same second).
-- Distribution: weighted toward lunch (12-14) + snack (16-18) peaks.
-- Deterministic per row id so re-runs are stable.

with bunched as (
  select date_trunc('second', placed_at) as sec, count(*) as n
  from orders
  group by 1
  having count(*) >= 5
)
update orders o
set placed_at =
  (now() at time zone 'Asia/Kolkata')::date
  - ((abs(hashtext(o.id::text)) % 14) || ' days')::interval   -- day 0..13
  + (
      case (abs(hashtext(o.id::text || 'h')) % 10)
        when 0 then 8   when 1 then 9   when 2 then 10
        when 3 then 12  when 4 then 12  when 5 then 13
        when 6 then 13  when 7 then 16  when 8 then 17
        else 19
      end
    ) * interval '1 hour'
  + ((abs(hashtext(o.id::text || 'm')) % 60) || ' minutes')::interval
  + ((abs(hashtext(o.id::text || 's')) % 60) || ' seconds')::interval
from bunched b
where date_trunc('second', o.placed_at) = b.sec;

-- keep ready_at / completed_at consistent for finished orders
update orders
set ready_at = placed_at + interval '6 minutes'
where status in ('ready','completed') and ready_at is null;

update orders
set completed_at = placed_at + interval '12 minutes'
where status = 'completed' and completed_at is null;

-- ---------- 3. Sanity ----------
do $$
declare
  n_orders int;
  n_distinct_days int;
  n_realtime int;
begin
  select count(*) into n_orders from orders;
  select count(distinct (placed_at at time zone 'Asia/Kolkata')::date)
    into n_distinct_days from orders;
  select count(*) into n_realtime
    from pg_publication_tables
    where pubname='supabase_realtime' and tablename in ('orders','order_items');
  raise notice 'orders=%  distinct_days=%  realtime_tables=%',
    n_orders, n_distinct_days, n_realtime;
end $$;
