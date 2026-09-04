# canteen-patch3 · Phase 1 + 2 (Stock + Forecast)

Adds live stock management (sold-out badge, restock UI, automatic decrement)
and a daily demand forecast (Edge Function + operator "Morning Prep" screen
where you approve every predicted number before the kitchen cooks it).

**Loops from MessMind blueprint hit by this patch:** A (skip the queue) foundation, B (morning forecast) end-to-end.

---

## Files in this bundle

```
sql/
  phase1_stock.sql                  ← run in Supabase SQL editor
  phase2_forecast.sql               ← run in Supabase SQL editor (after phase 1)

scripts/
  seed_historical.py                ← run locally to seed 90d of orders

supabase/
  functions/
    forecast-daily/index.ts         ← deploy via Supabase CLI
    write-actuals/index.ts          ← deploy via Supabase CLI

src/
  types/db.ts                       ← REPLACE
  components/MenuGrid.tsx           ← REPLACE
  components/StockBadge.tsx         ← NEW
  app/operator/layout.tsx           ← REPLACE (adds Prep + Stock nav)
  app/operator/stock/page.tsx       ← NEW
  app/operator/prep/page.tsx        ← NEW
  app/student/menu/page.tsx         ← REPLACE (stock realtime + precheck)

docs/models/forecast_v1.md          ← NEW (model card for report)
```

---

## Apply order — do these in sequence

### Step 1 · Copy files into repo (Git Bash on Windows)

```bash
cd ~/Downloads/canteen-mvp

# SQL
mkdir -p sql
cp ~/Downloads/canteen-patch3/sql/phase1_stock.sql sql/
cp ~/Downloads/canteen-patch3/sql/phase2_forecast.sql sql/

# Seed script
cp ~/Downloads/canteen-patch3/scripts/seed_historical.py scripts/

# Edge Functions
mkdir -p supabase/functions/forecast-daily supabase/functions/write-actuals
cp ~/Downloads/canteen-patch3/supabase/functions/forecast-daily/index.ts   supabase/functions/forecast-daily/
cp ~/Downloads/canteen-patch3/supabase/functions/write-actuals/index.ts    supabase/functions/write-actuals/

# Frontend
cp ~/Downloads/canteen-patch3/src/types/db.ts                              src/types/db.ts
cp ~/Downloads/canteen-patch3/src/components/MenuGrid.tsx                  src/components/MenuGrid.tsx
cp ~/Downloads/canteen-patch3/src/components/StockBadge.tsx                src/components/StockBadge.tsx
cp ~/Downloads/canteen-patch3/src/app/operator/layout.tsx                  src/app/operator/layout.tsx
mkdir -p src/app/operator/stock src/app/operator/prep
cp ~/Downloads/canteen-patch3/src/app/operator/stock/page.tsx              src/app/operator/stock/page.tsx
cp ~/Downloads/canteen-patch3/src/app/operator/prep/page.tsx               src/app/operator/prep/page.tsx
cp ~/Downloads/canteen-patch3/src/app/student/menu/page.tsx                src/app/student/menu/page.tsx

# Docs
mkdir -p docs/models
cp ~/Downloads/canteen-patch3/docs/models/forecast_v1.md                   docs/models/forecast_v1.md
```

**If browser flattened the downloads** (all files ended up in `~/Downloads/`
with `(1)`, `(2)` suffixes) — disambiguate by file size:
- `page.tsx` ~4 KB → `operator/prep/page.tsx`
- `page.tsx` ~7 KB → `operator/stock/page.tsx`
- `page.tsx` ~11 KB → `student/menu/page.tsx`
- `MenuGrid.tsx` ~6 KB · `StockBadge.tsx` ~800 B · `layout.tsx` ~3 KB · `db.ts` ~1.6 KB

---

### Step 2 · Run Phase 1 SQL (adds stock columns + triggers)

**Supabase Dashboard → SQL Editor → paste `sql/phase1_stock.sql` → Run.**

Expected: `NOTICE` about realtime publication (safe to ignore if already added).
Verification query at bottom returns one row per category with `total_cap` > 0.

**Sanity check** — this should now return rows:
```sql
SELECT name, category, stock_today, stock_cap, is_available
FROM menu_items
ORDER BY category, name
LIMIT 10;
```

---

### Step 3 · Run Phase 2 SQL (forecast tables + audit)

**Supabase Dashboard → SQL Editor → paste `sql/phase2_forecast.sql` → Run.**

⚠️ **Check column type first.** The file assumes `menu_items.id` is `uuid`.
If your DB uses `bigint`, edit line 12 of the SQL:
```sql
item_id  bigint NOT NULL REFERENCES public.menu_items(id) ...
```
Check with:
```sql
SELECT data_type FROM information_schema.columns
WHERE table_name='menu_items' AND column_name='id';
```

The cron section at the bottom of the file is commented out — we come back to
it in Step 6 after the Edge Functions are deployed.

---

### Step 4 · Seed 90 days of history (needed for forecast to have signal)

```bash
cd ~/Downloads/canteen-mvp/scripts

# One-time: install deps
pip install supabase python-dotenv

# Create .env in scripts/ (get service_role from Supabase → Project Settings → API)
cat > .env << 'EOF'
SUPABASE_URL=https://ltpvugbgehwjjorcztle.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...paste-here
EOF

# Run — takes 2-5 min (~4000 orders + ~7000 items)
python seed_historical.py
```

Verify in Supabase SQL:
```sql
SELECT date(placed_at) d, count(*)
FROM orders
WHERE placed_at > now() - interval '90 days'
GROUP BY d ORDER BY d;
```
Should show ~90 rows with daily counts between ~20 (weekends) and ~55 (Wed/Fri).

---

### Step 5 · Install Supabase CLI + deploy Edge Functions

**Install (Windows, Git Bash):**
```bash
# via scoop (recommended)
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase

# OR via npm
npm install -g supabase

# Verify
supabase --version
```

**Login + link project:**
```bash
cd ~/Downloads/canteen-mvp
supabase login              # opens browser
supabase link --project-ref ltpvugbgehwjjorcztle
# Enter DB password when prompted (in Supabase → Project Settings → Database)
```

**Deploy both functions:**
```bash
supabase functions deploy forecast-daily
supabase functions deploy write-actuals
```

**Set secrets** (Edge Functions need service_role to write):
```bash
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=eyJ...paste-here
# SUPABASE_URL is set automatically by Supabase
```

**Test manually:**
```bash
# Get your anon key from Supabase → Project Settings → API
curl -X POST https://ltpvugbgehwjjorcztle.supabase.co/functions/v1/forecast-daily \
  -H "Authorization: Bearer <ANON_KEY>" \
  -H "Content-Type: application/json"
```
Should return `{"ok":true,"items_scored":N,"target":"YYYY-MM-DD"}`.

Verify in Supabase SQL:
```sql
SELECT * FROM daily_forecasts ORDER BY created_at DESC LIMIT 10;
SELECT * FROM model_runs      ORDER BY run_at DESC LIMIT 5;
```

---

### Step 6 · Schedule daily cron jobs

**In Supabase Dashboard:**
1. Database → Extensions → search **`pg_cron`** → toggle **enable**
2. Database → Extensions → search **`pg_net`** → toggle **enable**

Then open `sql/phase2_forecast.sql`, uncomment the block at the bottom
(between `/*` and `*/`), replace `<PROJECT_REF>` and `<ANON_KEY>`, and run
just that block in the SQL editor.

Verify:
```sql
SELECT jobname, schedule, command FROM cron.job;
```
Should show 2 rows: `forecast-daily-6am-ist` and `write-actuals-11pm-ist`.

---

### Step 7 · Push to GitHub

```bash
cd ~/Downloads/canteen-mvp
git add .
git commit -m "feat: phase 1+2 — stock counter, sold-out UX, daily demand forecast + operator prep screen"
git push
```

Vercel auto-deploys on push.

---

## Verification (after Vercel deploy)

### Student side (`/student/menu`)
- [ ] Any item with `stock_today = 0` renders greyed + "Sold out" badge + disabled button
- [ ] Items with < 20% of cap show amber "Only N left" badge
- [ ] Open the menu in a second browser → open operator Stock tab in first browser → drop an item to 0 → student browser flips to sold out **without refresh**
- [ ] Try checkout with a cart item that's just been sold out → error message "Not enough stock: X"

### Operator side
- [ ] `/operator/stock` — table shows all items grouped by category. +/− buttons update instantly. "Set" restocks to typed number.
- [ ] `/operator/prep` — after Step 5 runs, shows one card per item with "Suggested: N plates" and Accept/Edit buttons. Accepting sets `stock_today` and `stock_cap` on the item.
- [ ] Header shows last model run timestamp + 14-day MAPE (will say "no actuals yet" for first day; populates after Step 6 runs the end-of-day cron).

### Rubric evidence for report
- [ ] `model_runs` table has success entries → automation audit trail
- [ ] `daily_forecasts.accepted_by` / `accepted_at` populate → augmentation checkpoint proof
- [ ] `docs/models/forecast_v1.md` → model card ready for the CLO3 fairness section

---

## Rollback

Everything is reversible:

```sql
-- Rollback Phase 2
DROP TABLE IF EXISTS public.daily_forecasts CASCADE;
DROP TABLE IF EXISTS public.model_runs CASCADE;
SELECT cron.unschedule('forecast-daily-6am-ist');
SELECT cron.unschedule('write-actuals-11pm-ist');

-- Rollback Phase 1
DROP TRIGGER IF EXISTS trg_decrement_stock ON public.order_items;
DROP TRIGGER IF EXISTS trg_sync_availability ON public.menu_items;
DROP FUNCTION IF EXISTS public.decrement_stock();
DROP FUNCTION IF EXISTS public.sync_availability();
ALTER TABLE public.menu_items
  DROP COLUMN IF EXISTS stock_today,
  DROP COLUMN IF EXISTS stock_cap,
  DROP COLUMN IF EXISTS is_available;   -- ⚠️ only if you never had this column pre-patch
```

---

## Known limits (deliberate for this batch)

- **Stock decrement is per-order-item, not per-order.** Multiple line items in one order = multiple trigger fires. Fine at MVP scale.
- **No manager override log for restocks yet.** The Stock tab restocks silently. Phase 4 adds an audit table.
- **Forecast uses UTC-anchored dates.** IST vs UTC offset means the "6 AM IST cron" writes forecast for the UTC date, which may occasionally shift by a day at boundary conditions. Not a problem in practice — accuracy metric still lands correctly.
- **Cold-start category fallback is 20 plates.** Hardcoded. Change if canteen is much smaller/larger.

---

## Next patches (still coming)

- **Patch 4:** Live ETA prediction on student checkout (Loop A, Model #2)
- **Patch 5:** Ingredient BOM + depletion alerts on KDS (Loop A/B, Model #3)
- **Patch 6:** Last Plate discount trigger + student recommender (Loop C + cross, Model #4 + #5)
