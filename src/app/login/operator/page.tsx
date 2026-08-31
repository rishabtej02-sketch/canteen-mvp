"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { setOperator, OPERATOR_PASSWORD } from "@/lib/auth";
import { Logo } from "@/components/Logo";

export default function OperatorLoginPage() {
  const router = useRouter();
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    if (pw !== OPERATOR_PASSWORD) {
      setErr("Wrong password.");
      setBusy(false);
      return;
    }
    setOperator("Kitchen");
    router.push("/operator/kds");
  };

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5">
        <Logo />
        <Link href="/login/student" className="btn-ghost text-sm">
          ← Student login
        </Link>
      </header>

      <main className="mx-auto grid max-w-6xl gap-8 px-4 py-10 md:grid-cols-[1fr_1fr]">
        <div className="card p-8 animate-fade-up">
          <div className="badge bg-accent-500/10 text-amber-700 ring-1 ring-amber-200">
            Staff sign in
          </div>
          <h1 className="mt-3 text-3xl font-bold">Kitchen Display Access</h1>
          <p className="mt-1 text-sm text-slate-500">
            Enter the operator password to open the live kitchen queue.
          </p>

          <form onSubmit={submit} className="mt-6 space-y-3">
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Operator password
            </label>
            <input
              type="password"
              className="input"
              placeholder="•••••••"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              autoFocus
            />
            {err && (
              <div className="rounded-lg bg-rose-50 p-2 text-xs text-rose-700 ring-1 ring-rose-200">
                {err}
              </div>
            )}
            <button className="btn-primary w-full" disabled={busy}>
              {busy ? "Signing in…" : "Open KDS →"}
            </button>
          </form>

          <div className="mt-6 rounded-xl bg-slate-50 p-3 text-xs text-slate-500 ring-1 ring-slate-200">
            <b>Default password:</b> <code>canteen-op</code>. Override via
            <code> NEXT_PUBLIC_OPERATOR_PASSWORD</code> in Vercel env vars.
          </div>
        </div>

        <div className="card p-8 animate-fade-up">
          <div className="text-sm font-semibold text-slate-700">Why a KDS?</div>
          <ul className="mt-3 space-y-3 text-sm text-slate-600">
            <li>🟢 <b>Live order feed</b> — new orders appear the second students place them.</li>
            <li>⏱ <b>Age tinting</b> — cards go amber after 10 min, red after 15 min.</li>
            <li>✅ <b>One-tap status</b> — Pending → Preparing → Ready → Picked up.</li>
            <li>📈 <b>Analytics</b> — daily revenue, order counts, top items on <code>/operator/analytics</code>.</li>
          </ul>
        </div>
      </main>
    </div>
  );
}
