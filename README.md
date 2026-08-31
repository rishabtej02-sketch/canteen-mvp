# Canteen MVP

AI-driven college canteen management. Next.js 14 (App Router) + Supabase (Postgres + Realtime) + Python for the ML side.

## What's inside

- `src/app/` — Next.js App Router
  - `/` — landing
  - `/student` — menu + cart + place order + live status of your own orders
  - `/operator` — Kitchen Display System (KDS), live via Supabase Realtime
- `src/components/` — `MenuGrid`, `Cart`, `OrderCard`, `StatusPill`
- `src/lib/supabase.ts` — browser client (singleton)
- `src/lib/supabase-server.ts` — server-side client (anon or service role)
- `src/types/db.ts` — DB row types
- `sql/schema.sql` — full schema (profiles, menu_items, orders, order_items, hourly_forecasts, item_reco_weights), RLS, realtime enablement
- `scripts/seed.py` — resilient CSV → Supabase seeder (see comments inside)

## Quick start (local)

```bash
# 1. install
npm install

# 2. env
cp .env.example .env.local
# fill NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY

# 3. schema (once, in Supabase SQL editor)
#    paste sql/schema.sql and run

# 4. dev
npm run dev
# open http://localhost:3000
```

## Deploy to Vercel

```bash
# one-time
npm i -g vercel
vercel login

# from repo root
vercel            # first deploy → creates project, prompts for scope
vercel --prod     # ship to production
```

In the Vercel dashboard, set the same env vars under Project → Settings → Environment Variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- (optional, for server tasks) `SUPABASE_SERVICE_ROLE_KEY`

## Push to GitHub

```bash
git init
git add -A
git commit -m "chore: initial canteen-mvp scaffold"
git branch -M main
git remote add origin git@github.com:<you>/canteen-mvp.git
git push -u origin main
```

## Realtime notes

`sql/schema.sql` runs `alter publication supabase_realtime add table orders;` and same for `order_items` — do NOT re-run those lines if Supabase reports "relation is already member of publication".

## Roadmap (ML)

1. Demand forecast → `hourly_forecasts` (Prophet or LightGBM per item, hourly)
2. Queue / staffing → M/M/c model on live `orders` arrival rate
3. Dynamic ETA → gradient-boosted regressor on (queue depth, prep_seconds, hour of day)
4. Time-aware hybrid recommender → `item_reco_weights`; ALS + time-decay + category priors

Each writes to its target table; the frontend just reads.
