-- ============================================================================
-- Phase 3: Live ETA prediction
-- ============================================================================
-- Adds kitchen_settings (singleton) — operator's live inputs to the ETA model.
-- ETA columns (predicted_eta_min, eta_lower_bound, eta_upper_bound,
-- queue_position_at_order, eta_seconds) already exist on orders table.
--
-- Augmentation checkpoints powered by this table:
--   1. Kitchen Mode toggle (Normal/Rush/Slow)  → live multiplier on new ETAs
--   2. Throughput tuning                        → operator adjusts after MAPE review
-- ============================================================================

-- 1. Singleton table -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS kitchen_settings (
  id                  INTEGER PRIMARY KEY DEFAULT 1,
  speed_mode          TEXT NOT NULL DEFAULT 'Normal'
                      CHECK (speed_mode IN ('Normal', 'Rush', 'Slow')),
  throughput_per_min  NUMERIC NOT NULL DEFAULT 3.0
                      CHECK (throughput_per_min > 0),
  updated_by          TEXT,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT singleton_row CHECK (id = 1)
);

-- 2. Seed the single row -------------------------------------------------------
INSERT INTO kitchen_settings (id, speed_mode, throughput_per_min)
VALUES (1, 'Normal', 3.0)
ON CONFLICT (id) DO NOTHING;

-- 3. RLS: open (matches project convention for MVP demo) -----------------------
ALTER TABLE kitchen_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kitchen_settings_read   ON kitchen_settings;
DROP POLICY IF EXISTS kitchen_settings_update ON kitchen_settings;

CREATE POLICY kitchen_settings_read
  ON kitchen_settings FOR SELECT
  USING (true);

CREATE POLICY kitchen_settings_update
  ON kitchen_settings FOR UPDATE
  USING (true) WITH CHECK (true);

-- 4. Realtime so the operator page stays live across tabs ----------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'kitchen_settings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE kitchen_settings;
  END IF;
END $$;

-- 5. Sanity check --------------------------------------------------------------
DO $$
DECLARE
  ks_count INT;
  eta_col_exists BOOLEAN;
BEGIN
  SELECT count(*) INTO ks_count FROM kitchen_settings;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'eta_seconds'
  ) INTO eta_col_exists;

  RAISE NOTICE 'kitchen_settings rows = %', ks_count;
  RAISE NOTICE 'orders.eta_seconds column exists = %', eta_col_exists;

  IF ks_count = 0 THEN
    RAISE EXCEPTION 'kitchen_settings seed failed';
  END IF;
  IF NOT eta_col_exists THEN
    RAISE EXCEPTION 'orders.eta_seconds missing — ETA function will fail';
  END IF;
END $$;
