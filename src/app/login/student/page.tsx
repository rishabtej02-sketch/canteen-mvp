"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import { setStudent, profileToStudent } from "@/lib/auth";
import { Logo } from "@/components/Logo";
import type { Profile } from "@/types/db";

export default function StudentLoginPage() {
  const router = useRouter();
  const supabase = getSupabase();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Profile[]>([]);

  // Suggest a few real students so the demo is instantly usable
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id,email,full_name,role,created_at")
        .eq("role", "student")
        .limit(6);
      setSuggestions((data ?? []) as Profile[]);
    })();
  }, [supabase]);

  const loginWith = async (e?: string) => {
    setErr(null);
    const target = (e ?? email).trim().toLowerCase();
    if (!target) {
      setErr("Enter your email.");
      return;
    }
    setLoading(true);
    try {
      const { data } = await supabase
        .from("profiles")
        .select("id,email,full_name,role,created_at")
        .eq("email", target)
        .maybeSingle();
      if (!data) {
        setErr("No student found with that email. Try one of the suggestions below.");
        setLoading(false);
        return;
      }
      setStudent(profileToStudent(data as Profile));
      router.push("/student/menu");
    } catch (e) {
      setErr((e as Error).message || "Login failed");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5">
        <Logo />
        <Link href="/login/operator" className="btn-ghost text-sm">
          Operator login →
        </Link>
      </header>

      <main className="mx-auto grid max-w-6xl gap-8 px-4 py-10 md:grid-cols-[1fr_1fr]">
        <div className="card p-8 animate-fade-up">
          <div className="badge bg-brand-100 text-brand-700">Student sign in</div>
          <h1 className="mt-3 text-3xl font-bold">Welcome back 👋</h1>
          <p className="mt-1 text-sm text-slate-500">
            Enter the email on file, or pick a demo profile on the right.
          </p>

          <form
            className="mt-6 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              loginWith();
            }}
          >
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Email
            </label>
            <input
              type="email"
              className="input"
              placeholder="you@campus.local"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
            />
            {err && (
              <div className="rounded-lg bg-rose-50 p-2 text-xs text-rose-700 ring-1 ring-rose-200">
                {err}
              </div>
            )}
            <button className="btn-primary w-full" disabled={loading}>
              {loading ? "Signing in…" : "Continue → Menu"}
            </button>
          </form>

          <div className="mt-6 rounded-xl bg-slate-50 p-3 text-xs text-slate-500 ring-1 ring-slate-200">
            <b>Demo mode:</b> we look you up in the <code>profiles</code> table.
            Real Supabase Auth (magic link + password) drops in from the same
            client — see <code>src/lib/auth.ts</code>.
          </div>
        </div>

        <div className="animate-fade-up">
          <div className="mb-2 text-sm font-semibold text-slate-700">
            Try a demo student
          </div>
          <div className="grid gap-2">
            {suggestions.length === 0 ? (
              <div className="card p-4 text-sm text-slate-500">
                No profiles found yet. Run <code>sql/migration.sql</code> and seed the DB.
              </div>
            ) : (
              suggestions.map((s) => (
                <button
                  key={s.id}
                  onClick={() => loginWith(s.email)}
                  className="card-hover flex items-center justify-between p-3 text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-brand text-xs font-bold text-white">
                      {(s.full_name ?? s.email).slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="text-sm font-semibold">
                        {s.full_name ?? "Student"}
                      </div>
                      <div className="text-xs text-slate-500">{s.email}</div>
                    </div>
                  </div>
                  <span className="text-brand-600">→</span>
                </button>
              ))
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
