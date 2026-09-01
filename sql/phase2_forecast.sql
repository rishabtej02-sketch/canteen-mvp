-- ============================================================================
-- Phase 2 · Forecast tables + audit trail + cron  (v2 - integer FK)
-- Run AFTER phase1_stock.sql
-- menu_items.id is integer in this DB.
-- ============================================================================

BEGIN;

-- 1) Forecast table -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.daily_forecasts (
  id              bigserial PRIMARY KEY,
  item_id         integer NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
  forecast_date   date NOT NULL,
  predicted_qty   integer NOT NULL,
  actual_qty      integer,
  accepted_qty    integer,
  accepted_by     text,
  accepted_at     timestamptz,
  model_version   text NOT NULL DEFAULT 'exp_smooth_v1',
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (item_id, forecast_date, model_version)
);

CREATE INDEX IF NOT EXISTS idx_forecasts_date ON public.daily_forecasts(forecast_date DESC);

-- 2) Model runs audit trail --------------------------------------------------
CREATE TABLE IF NOT EXISTS public.model_runs (
  id            bigserial PRIMARY KEY,
  model_name    text NOT NULL,
  run_at        timestamptz NOT NULL DEFAULT now(),
  status        text NOT NULL,
  items_scored  integer,
  duration_ms   integer,
  notes         text
);

CREATE INDEX IF NOT EXISTS idx_model_runs_at ON public.model_runs(run_at DESC);

-- 3) RLS (open for MVP) -------------------------------------------------------
ALTER TABLE public.daily_forecasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.model_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "forecasts_all" ON public.daily_forecasts;
CREATE POLICY "forecasts_all" ON public.daily_forecasts FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "model_runs_all" ON public.model_runs;
CREATE POLICY "model_runs_all" ON public.model_runs FOR ALL USING (true) WITH CHECK (true);

-- 4) Realtime on forecasts ---------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'daily_forecasts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.daily_forecasts;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Realtime publication add skipped: %', SQLERRM;
END $$;

COMMIT;

-- ============================================================================
-- 5) Cron jobs (run SEPARATELY after Edge Functions are deployed)
--    Requires pg_cron + pg_net extensions (Dashboard → Database → Extensions)
--
-- REPLACE before running:
--   <PROJECT_REF>  →  ltpvugbgehwjjorcztle
--   <ANON_KEY>     →  from Supabase → Project Settings → API
-- ============================================================================

/*

SELECT cron.schedule(
  'forecast-daily-6am-ist',
  '30 0 * * *',
  $$
  SELECT net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/forecast-daily',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <ANON_KEY>'
    ),
    body := jsonb_build_object('trigger', 'cron')
  );
  $$
);

SELECT cron.schedule(
  'write-actuals-11pm-ist',
  '30 17 * * *',
  $$
  SELECT net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/write-actuals',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <ANON_KEY>'
    ),
    body := jsonb_build_object('trigger', 'cron')
  );
  $$
);

*/
