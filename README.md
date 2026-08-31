# Canteen AI — MVP

AI-driven college canteen management. Next.js 14 (App Router) + Supabase (Postgres + Realtime) + Python for the ML side.

## Live routes

| Route | Who | What |
|---|---|---|
| `/` | Everyone | Landing page (hero, features, CTAs) |
| `/login/student` | Students | Email lookup + demo profile suggestions |
| `/login/operator` | Staff | Password gate (default `canteen-op`) |
| `/student/menu` | Student (auth) | Live menu, cart, active-order tracker |
| `/student/orders` | Student (auth) | Order history + **spend tracker** (chart, top items) |
| `/operator/kds` | Operator (auth) | Kitchen Display, live via Supabase Realtime |
| `/operator/analytics` | Operator (auth) | Daily revenue, top items, hour-of-day peaks |

## Setup (once)

### 1 — Supabase schema

Open the Supabase SQL editor for your project → paste **`sql/migration.sql`** → **Run**.
It's idempotent and safe on an existing DB — it only *adds* missing columns (`placed_at`, `prep_seconds`, `is_available`, etc.) and enables realtime + RLS.

If your DB is brand new, `sql/schema.sql` sets it up from scratch.

### 2 — Env vars

```bash
cp .env.example .env.local
# then edit
```

Required:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Optional:
- `NEXT_PUBLIC_OPERATOR_PASSWORD` (defaults to `canteen-op`)
- `SUPABASE_SERVICE_ROLE_KEY` (server-side scripts only — never expose to browser)

### 3 — Local dev

```bash
npm install
npm run dev
# http://localhost:3000
```

### 4 — Deploy on Vercel

Push to GitHub. In Vercel → **Import** `canteen-mvp` → paste the env vars → Deploy.
Every subsequent `git push` to `main` auto-deploys.

## Project layout

```
src/
  app/
    layout.tsx                 # root shell
    page.tsx                   # landing
    globals.css                # design system
    login/
      student/page.tsx         # student sign in
      operator/page.tsx        # operator sign in
    student/
      layout.tsx               # header + nav (guarded)
      menu/page.tsx            # menu + cart + active orders
      orders/page.tsx          # history + spend tracker
    operator/
      layout.tsx               # header + nav (guarded)
      kds/page.tsx             # kitchen display (Realtime)
      analytics/page.tsx       # revenue + top items + hour peaks
  components/
    Logo · CategoryIcon · MenuGrid · Cart · OrderCard
    StatusPill · OrderProgress · SpendChart · EmptyState
  lib/
    supabase.ts                # browser client (singleton)
    supabase-server.ts         # server client (anon | admin)
    auth.ts                    # demo session helpers (localStorage)
    format.ts                  # inr, fmtDate, prepMinutes, etc.
  types/
    db.ts                      # DB row + view types
sql/
  schema.sql                   # fresh install
  migration.sql                # safe upgrade for existing DB (run first)
scripts/
  seed.py                      # resilient CSV → Supabase seeder
```

## Design

- **Palette:** indigo → violet → pink gradient primary, amber accent (food-warm), slate neutrals.
- **Type:** system UI, bold headings, semibold labels.
- **Cards:** rounded-2xl, soft shadow, subtle hover-lift.
- **Motion:** `fade-up` on mount, `pulse-dot` on live statuses.
- **Icons:** category emoji (🍛 🥪 🥤 🍰) — no external icon deps.

## Auth model (MVP demo)

Sessions are held in `localStorage` (see `src/lib/auth.ts`):

```ts
StudentSession  = { id, email, full_name }   // bound to profiles.id
OperatorSession = { label, loggedInAt }      // password-gated
```

Swap this for real Supabase Auth (magic link or email + password) by replacing `lib/auth.ts` — the rest of the app calls `getStudent()` / `getOperator()` and doesn't care where the session came from.

## Roadmap (ML)

1. **Demand forecast** → `hourly_forecasts` (Prophet or LightGBM per item, hourly).
2. **Queue / staffing** → M/M/c model on live `orders` arrival rate.
3. **Dynamic ETA** → gradient-boosted regressor on (queue depth, prep_seconds, hour of day).
4. **Time-aware hybrid recommender** → `item_reco_weights`; ALS + time-decay + category priors.

Each writes to its target table; the frontend just reads.
