import Link from "next/link";

export default function Home() {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <section className="card p-6">
        <h1 className="text-2xl font-bold text-slate-900">
          AI-driven canteen for 2,000+ students
        </h1>
        <p className="mt-2 text-slate-600">
          Order-ahead menu, live kitchen display, demand forecasting, dynamic
          ETAs, and personalized recommendations — all powered by Supabase
          Realtime.
        </p>
        <div className="mt-6 flex gap-3">
          <Link href="/student" className="btn-primary">
            Open student app →
          </Link>
          <Link href="/operator" className="btn-ghost ring-1 ring-slate-200">
            Open operator KDS →
          </Link>
        </div>
      </section>

      <section className="card p-6">
        <h2 className="text-lg font-semibold">System snapshot</h2>
        <ul className="mt-3 space-y-2 text-sm text-slate-700">
          <li>
            <span className="badge bg-brand-100 text-brand-700">Frontend</span>{" "}
            Next.js 14 App Router · Tailwind · Supabase JS
          </li>
          <li>
            <span className="badge bg-emerald-100 text-emerald-700">
              Backend
            </span>{" "}
            Supabase Postgres · Realtime · RLS
          </li>
          <li>
            <span className="badge bg-amber-100 text-amber-700">ML</span>{" "}
            Forecasting · Queueing · ETA · Hybrid recommender (Python)
          </li>
          <li>
            <span className="badge bg-sky-100 text-sky-700">Seeded</span> 40
            items · 2,000 students · 100 orders · 300 lines
          </li>
        </ul>
      </section>
    </div>
  );
}
