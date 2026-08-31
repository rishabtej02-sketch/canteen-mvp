# Deploy notes

## GitHub

Repo: https://github.com/rishabtej02-sketch/canteen-mvp
Default branch: `main`

## Vercel — one-time setup

The sandbox this session runs in can reach `github.com` but **not** `api.vercel.com`, so the first deploy has to be triggered from your own machine or the Vercel dashboard. Any of these paths works.

### Path A — Dashboard (easiest, ~1 min)

1. Open <https://vercel.com/new>
2. If prompted, "Continue with GitHub" and authorize Vercel.
3. Find **`canteen-mvp`** in the repo list → **Import**.
4. Framework: **Next.js** (auto-detected). Leave build/output settings default.
5. Expand **Environment Variables** and add:
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://ltpvugbgehwjjorcztle.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = *(from your `.env.local`)*
   - `SUPABASE_SERVICE_ROLE_KEY` = *(optional, only needed if you run server-side seed scripts)*
6. Click **Deploy**. Every future `git push` to `main` auto-deploys.

### Path B — Local Vercel CLI (Windows PowerShell)

```powershell
cd $HOME\Downloads\canteen-mvp
npm i -g vercel
vercel login                       # opens browser once
vercel link --yes                  # creates/links project
vercel env add NEXT_PUBLIC_SUPABASE_URL production
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
vercel --prod
```

## Supabase — one-time setup

1. Open the Supabase SQL editor for the `ltpvugbgehwjjorcztle` project.
2. Paste the contents of `sql/schema.sql` and run.
3. (Optional) Seed data — needs `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`:
   ```bash
   pip install -r scripts/requirements.txt
   python scripts/seed.py
   ```

## Redeploy any time

```bash
git add -A && git commit -m "…" && git push
# Vercel auto-deploys via the GitHub integration
```
