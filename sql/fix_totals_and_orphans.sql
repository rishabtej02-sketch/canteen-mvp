-- ─────────────────────────────────────────────────────────────────────────────
-- fix_totals_and_orphans.sql
--
-- WHY THIS EXISTS
--   Two related bugs in the checkout flow caused corrupt rows in `orders`:
--
--   1. Zero-total rows WITH items — the frontend inserted `total_amount = 0`
--      even though the matching `order_items` rows had real unit_prices
--      (e.g. Order #AFD6 shows "1× Cutting Chai" but ₹0). Confirmed via
--      Q4 diagnostic on Aug 31, 2026.
--
--   2. Empty rows (0 lines · 0 items · ₹0) — the frontend inserted the
--      parent `orders` row, then the `order_items` insert silently failed
--      or returned nothing, leaving an orphan. There was no rollback.
--
-- WHAT THIS DOES
--   Part A: adds an AFTER-INSERT/UPDATE/DELETE trigger on order_items that
--           keeps orders.total_amount always in sync with the sum of its
--           items. Frontend can never send a wrong total again.
--
--   Part B: recomputes every existing order's total_amount from its items
--           (fixes rows like #AFD6 that already exist).
--
--   Part C: deletes true orphans — orders with zero items AND zero total.
--           Never touches an order that has items (Aryan's real pending
--           orders are safe — they have items).
--
-- HOW TO RUN
--   Supabase Dashboard → SQL editor → paste this file → Run.
--   Safe to run multiple times. Wrapped in one transaction.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ─── PART A: keep orders.total_amount in sync automatically ─────────────────
-- Function type-agnostic on the id column (works for uuid or bigint PKs).

CREATE OR REPLACE FUNCTION public.sync_order_total()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE public.orders o
    SET total_amount = COALESCE((
      SELECT SUM(quantity * unit_price)
      FROM public.order_items
      WHERE order_id = OLD.order_id
    ), 0)
    WHERE o.id = OLD.order_id;
    RETURN OLD;
  ELSE
    UPDATE public.orders o
    SET total_amount = COALESCE((
      SELECT SUM(quantity * unit_price)
      FROM public.order_items
      WHERE order_id = NEW.order_id
    ), 0)
    WHERE o.id = NEW.order_id;
    -- If UPDATE moved a row between orders, also refresh the old parent.
    IF TG_OP = 'UPDATE' AND OLD.order_id IS DISTINCT FROM NEW.order_id THEN
      UPDATE public.orders o
      SET total_amount = COALESCE((
        SELECT SUM(quantity * unit_price)
        FROM public.order_items
        WHERE order_id = OLD.order_id
      ), 0)
      WHERE o.id = OLD.order_id;
    END IF;
    RETURN NEW;
  END IF;
END $$;

DROP TRIGGER IF EXISTS order_items_sync_total ON public.order_items;
CREATE TRIGGER order_items_sync_total
  AFTER INSERT OR UPDATE OR DELETE ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.sync_order_total();

-- ─── PART B: recompute totals for every existing order ──────────────────────
-- One statement, covers both the zero-total-with-items bug and any drift.

WITH sums AS (
  SELECT order_id, SUM(quantity * unit_price) AS s
  FROM public.order_items
  GROUP BY order_id
)
UPDATE public.orders o
SET total_amount = COALESCE(sums.s, 0)
FROM sums
WHERE o.id = sums.order_id
  AND o.total_amount IS DISTINCT FROM sums.s;

-- ─── PART C: delete true orphans (0 items AND 0 total) ──────────────────────

DELETE FROM public.orders o
WHERE o.total_amount = 0
  AND NOT EXISTS (
    SELECT 1 FROM public.order_items oi WHERE oi.order_id = o.id
  );

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- Verification — should return zero rows for all three.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) Orders with items but zero total (should be 0 rows).
SELECT o.id, o.total_amount, count(oi.id) AS n_items
FROM public.orders o
JOIN public.order_items oi ON oi.order_id = o.id
GROUP BY o.id, o.total_amount
HAVING o.total_amount = 0;

-- 2) Orphan orders (0 items) — should be 0 rows.
SELECT o.id, o.status, o.total_amount, o.placed_at
FROM public.orders o
LEFT JOIN public.order_items oi ON oi.order_id = o.id
WHERE oi.id IS NULL;

-- 3) Sanity: total_amount matches sum-of-items for every order.
SELECT o.id, o.total_amount, COALESCE(sums.s, 0) AS computed
FROM public.orders o
LEFT JOIN (
  SELECT order_id, SUM(quantity * unit_price) AS s
  FROM public.order_items GROUP BY order_id
) sums ON sums.order_id = o.id
WHERE o.total_amount IS DISTINCT FROM COALESCE(sums.s, 0);
