-- ============================================================================
-- Phase 1 · Stock counter + sold-out logic  (v2 - enum-aware)
-- Idempotent. Safe to re-run.
-- Enum values in this DB: lunch_dinner | snacks | beverages | desserts
-- ============================================================================

BEGIN;

-- 1) Columns ------------------------------------------------------------------
ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS stock_today   integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stock_cap     integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_available  boolean DEFAULT true;

-- 2) Seed realistic stock per category ---------------------------------------
UPDATE public.menu_items
SET stock_cap = CASE
    WHEN category::text = 'beverages'    AND name ILIKE '%chai%'   THEN 200
    WHEN category::text = 'beverages'    AND name ILIKE '%coffee%' THEN 200
    WHEN category::text = 'beverages'                              THEN 50
    WHEN category::text = 'snacks'                                 THEN 80
    WHEN category::text = 'lunch_dinner'                           THEN 40
    WHEN category::text = 'desserts'                               THEN 30
    ELSE 60
END
WHERE stock_cap = 0 OR stock_cap IS NULL;

UPDATE public.menu_items
SET stock_today = stock_cap
WHERE stock_today = 0 OR stock_today IS NULL;

UPDATE public.menu_items
SET is_available = (stock_today > 0);

-- 3) Decrement trigger --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.decrement_stock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.menu_items
  SET stock_today = GREATEST(stock_today - NEW.quantity, 0),
      is_available = (GREATEST(stock_today - NEW.quantity, 0) > 0)
  WHERE id = NEW.item_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_decrement_stock ON public.order_items;
CREATE TRIGGER trg_decrement_stock
AFTER INSERT ON public.order_items
FOR EACH ROW
EXECUTE FUNCTION public.decrement_stock();

-- 4) Restock trigger (auto-flip is_available when stock changes) -------------
CREATE OR REPLACE FUNCTION public.sync_availability()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.is_available := (NEW.stock_today > 0);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_availability ON public.menu_items;
CREATE TRIGGER trg_sync_availability
BEFORE UPDATE OF stock_today ON public.menu_items
FOR EACH ROW
WHEN (OLD.stock_today IS DISTINCT FROM NEW.stock_today)
EXECUTE FUNCTION public.sync_availability();

-- 5) Enable Realtime on menu_items -------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'menu_items'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.menu_items;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Realtime publication add skipped: %', SQLERRM;
END $$;

COMMIT;

-- Verification ---------------------------------------------------------------
SELECT category::text AS category,
       count(*) AS items,
       sum(stock_cap) AS total_cap,
       sum(stock_today) AS total_today
FROM public.menu_items
GROUP BY category
ORDER BY category;
