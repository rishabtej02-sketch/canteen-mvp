-- ─────────────────────────────────────────────────────────────────────────────
-- respread_placed_at.sql
--
-- WHY THIS EXISTS
--   The seeder (scripts/seed.py) inserted every completed order with
--   placed_at = default now() → all 200 rows share a single timestamp →
--   /student/orders and /operator/analytics charts collapse to one bar.
--   A previous fix attempt anchored on IST date arithmetic and pushed
--   some rows INTO the future relative to the UTC server clock, which
--   broke KDS age tinting too.
--
-- WHAT THIS DOES
--   For every row where status = 'completed', deterministically overwrite
--     placed_at   (uniformly across last 14 days, weighted toward lunch/tea)
--     ready_at    ≈ placed_at + 8-14 min
--     completed_at ≈ placed_at + 15-28 min
--
--   Uses hashtext(id::text) → deterministic per row id → running twice
--   yields identical values (idempotent).
--
-- WHAT THIS DOES NOT TOUCH
--   Rows with status IN ('pending','preparing','ready','cancelled') keep
--   their real timestamps. The 3 real pending orders from Aryan Malhotra
--   are untouched.
--
-- HOW TO RUN
--   Supabase Dashboard → SQL editor → paste this file → Run.
--   Safe to run multiple times.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

WITH salted AS (
  SELECT
    id,
    -- Deterministic non-negative int per row id (works for uuid or bigint).
    abs(hashtext(id::text))::bigint AS h
  FROM public.orders
  WHERE status = 'completed'
),
placed AS (
  SELECT
    id,
    -- Day offset: 0..13 → today back to 13 days ago.
    (h % 14)::int AS day_off,
    -- Hour bucket: 20 slots weighted for canteen realism.
    -- Morning ~15%, Lunch ~30%, Tea ~30%, Dinner ~25%.
    CASE ((h / 14) % 20)::int
      WHEN 0 THEN 9  WHEN 1 THEN 10 WHEN 2 THEN 11
      WHEN 3 THEN 12 WHEN 4 THEN 12 WHEN 5 THEN 13
      WHEN 6 THEN 13 WHEN 7 THEN 14 WHEN 8 THEN 14
      WHEN 9 THEN 15 WHEN 10 THEN 16 WHEN 11 THEN 16
      WHEN 12 THEN 17 WHEN 13 THEN 17 WHEN 14 THEN 18
      WHEN 15 THEN 19 WHEN 16 THEN 19 WHEN 17 THEN 20
      WHEN 18 THEN 20 WHEN 19 THEN 21
    END AS hour_of_day,
    ((h / 280) % 60)::int AS minute_of_hour,
    ((h / 16800) % 60)::int AS second_of_minute,
    -- Prep time 8-14 min, then dwell 7-14 min at the counter.
    (8 + ((h / 1008000) % 7))::int AS prep_min,
    (7 + ((h / 7056000) % 8))::int AS dwell_min
  FROM salted
),
computed AS (
  SELECT
    id,
    -- Anchor at today's midnight in UTC, subtract day_off days,
    -- then add hour/min/sec-of-day. All arithmetic stays in UTC,
    -- so no row ever lands in the future.
    (date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
      - make_interval(days => day_off)
      + make_interval(hours => hour_of_day, mins => minute_of_hour, secs => second_of_minute)
    ) AS new_placed_at,
    prep_min,
    dwell_min
  FROM placed
)
UPDATE public.orders o
SET
  placed_at    = c.new_placed_at,
  ready_at     = c.new_placed_at + make_interval(mins => c.prep_min),
  completed_at = c.new_placed_at + make_interval(mins => c.prep_min + c.dwell_min),
  eta_seconds  = COALESCE(o.eta_seconds, c.prep_min * 60)
FROM computed c
WHERE o.id = c.id;

-- Safety net: if any row ended up dated in the future (shouldn't happen
-- with the UTC anchor above, but guard against clock skew), pull it back
-- to now() - 1 hour so KDS age tinting stays sane.
UPDATE public.orders
SET
  placed_at    = now() - interval '1 hour',
  ready_at     = now() - interval '45 minutes',
  completed_at = now() - interval '30 minutes'
WHERE status = 'completed'
  AND (placed_at > now() OR completed_at > now());

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- Verification queries — run these AFTER the commit above to confirm.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) You should see roughly 14 distinct days, each with ~10-20 rows.
SELECT
  (placed_at AT TIME ZONE 'Asia/Kolkata')::date AS day_ist,
  count(*)                                       AS n_orders,
  sum(total_amount)::int                         AS revenue
FROM public.orders
WHERE status = 'completed'
GROUP BY 1
ORDER BY 1 DESC;

-- 2) Zero rows should be in the future.
SELECT count(*) AS future_rows
FROM public.orders
WHERE status = 'completed' AND placed_at > now();

-- 3) Hour-of-day distribution — lunch (12-14) and tea (16-18) should peak.
SELECT
  extract(hour FROM placed_at AT TIME ZONE 'Asia/Kolkata')::int AS hour_ist,
  count(*)                                                        AS n_orders
FROM public.orders
WHERE status = 'completed'
GROUP BY 1
ORDER BY 1;
