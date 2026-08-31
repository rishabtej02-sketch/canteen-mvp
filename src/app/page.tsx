import Link from "next/link";
import { Logo } from "@/components/Logo";

const FEATURES = [
  {
    icon: "⚡",
    title: "Skip the line",
    text: "Order ahead. Pick up when it's ready — no more waiting in a 40-person queue.",
  },
  {
    icon: "🍳",
    title: "Live kitchen display",
    text: "Operators see every order the second it's placed, powered by Supabase Realtime.",
  },
  {
    icon: "🎯",
    title: "Personalized picks",
    text: "Time-aware hybrid recommender learns what you eat and when you eat it.",
  },
  {
    icon: "📈",
    title: "Demand forecasting",
    text: "Hourly forecasts + queueing model keep the canteen stocked and staffed right.",
  },
];

const STATS = [
  { k: "40+",    v: "Menu items" },
  { k: "2,000",  v: "Student profiles" },
  { k: "<200ms", v: "Realtime updates" },
  { k: "4",      v: "ML models" },
];

export default function Home() {
  return (
    <div className="min-h-screen">
      {/* Top nav */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5">
        <Logo />
        <nav className="flex items-center gap-2 text-sm">
          <Link href="/login/student" className="btn-ghost">
            Student login
          </Link>
          <Link href="/login/operator" className="btn-outline">
            Operator login
          </Link>
        </nav>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 hero-grid opacity-60" />
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 md:grid-cols-2">
          <div className="animate-fade-up">
            <div className="badge bg-brand-100 text-brand-700">
              🚀 AI-driven canteen · MVP
            </div>
            <h1 className="mt-3 text-4xl font-black tracking-tight text-slate-900 md:text-5xl">
              The campus canteen,{" "}
              <span className="bg-gradient-brand bg-clip-text text-transparent">
                minus the queue.
              </span>
            </h1>
            <p className="mt-4 max-w-lg text-lg text-slate-600">
              Order ahead, pay later, and let the kitchen know exactly what
              2,000+ hungry students want — and when they want it.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/login/student" className="btn-primary">
                I&apos;m a student → order food
              </Link>
              <Link href="/login/operator" className="btn-ghost">
                I run the canteen → open KDS
              </Link>
            </div>

            <dl className="mt-8 grid grid-cols-4 gap-3">
              {STATS.map((s) => (
                <div key={s.v} className="stat">
                  <dt className="stat-label">{s.v}</dt>
                  <dd className="stat-value">{s.k}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Right visual — a mock order card */}
          <div className="animate-fade-up md:justify-self-end">
            <div className="card w-full max-w-md p-5">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-xs uppercase tracking-wide text-slate-500">
                  Kitchen display · live
                </div>
                <span className="badge bg-emerald-100 text-emerald-700">
                  <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse-dot" />
                  streaming
                </span>
              </div>
              <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-bold">Order #204</div>
                  <span className="badge bg-sky-100 text-sky-800">Preparing</span>
                </div>
                <ul className="mt-2 space-y-1 text-sm text-slate-700">
                  <li>2× Masala Dosa</li>
                  <li>1× Filter Coffee</li>
                  <li>1× Gulab Jamun</li>
                </ul>
                <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                  <span>Placed 12:14</span>
                  <span>ETA 6 min</span>
                  <span className="font-bold text-slate-900">₹210</span>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center text-[11px] text-slate-500">
                <div className="rounded-lg bg-slate-50 p-2">
                  <div className="text-base font-bold text-slate-900">42</div>
                  today
                </div>
                <div className="rounded-lg bg-slate-50 p-2">
                  <div className="text-base font-bold text-slate-900">₹8.4k</div>
                  revenue
                </div>
                <div className="rounded-lg bg-slate-50 p-2">
                  <div className="text-base font-bold text-slate-900">6.2m</div>
                  avg wait
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-6xl px-4 py-12">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <div key={f.title} className="card-hover p-5">
              <div className="text-2xl">{f.icon}</div>
              <div className="mt-2 font-semibold text-slate-900">{f.title}</div>
              <div className="mt-1 text-sm text-slate-600">{f.text}</div>
            </div>
          ))}
        </div>
      </section>

      <footer className="mx-auto max-w-6xl px-4 pb-10 pt-4 text-xs text-slate-500">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>Canteen AI · Next.js + Supabase + Python ML</div>
          <div className="flex gap-3">
            <Link href="/login/student" className="link">Student</Link>
            <Link href="/login/operator" className="link">Operator</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
